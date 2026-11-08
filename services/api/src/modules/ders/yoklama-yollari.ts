import {
  YOKLAMA_BEKLEYEN_GUN,
  YOKLAMA_SAAT_SAPMASI_DK,
  YoklamaBaslikSema,
  YoklamaBekleyenSorguSema,
  YoklamaBekleyenYanitSema,
  YoklamaKaydetYanitSema,
  YoklamaListeYanitSema,
  YoklamaTopluGirdiSema,
  errorCodes,
  yoklamaHataKodlari,
  type YoklamaDurumTipi,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { and, asc, desc, eq, exists, gte, inArray, lte, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { type z } from 'zod';

import {
  dersKatilimcilari,
  dersler,
  gruplar,
  yoklamaGecmisi,
  yoklamaIstekleri,
  yoklamalar,
} from '../../db/schema.js';
import { krediVeUcretiUygula, type YoklamaDurumu } from '../finans/index.js';
import { gorunenAdlar, requirePermission } from '../hesap/index.js';
import {
  dersBul,
  dersDenetimiYaz,
  dersKapsami,
  dersOlayiYaz,
  dersYaniti,
  katilimciIdleri,
  katilimciSayilari,
} from './ders-deposu.js';
import {
  dersParam,
  grupModuluAcikOlmali,
  kiraci,
  kurumParam,
  kurumSaatDilimi,
  olayBaglami,
  yetkiAl,
} from './ders-ortak.js';
import { dersKatilimcilariniEsitle } from './katilimci-esitle.js';
import {
  ayniIcerik,
  govdeOzeti,
  yoklamaGirdisiniNormallestir,
  yoklamaKilidiniKontrolEt,
  yoklamaOlayiYaz,
  yoklamaYaniti,
  type YoklamaGirdisi,
  type YoklamaSatiri,
} from './yoklama-deposu.js';
import { utcdenYerel } from './zaman.js';

const DAKIKA_MS = 60_000;
const GUN_MS = 86_400_000;

type KaydetYaniti = z.infer<typeof YoklamaKaydetYanitSema>;
type Sonuc = KaydetYaniti['sonuclar'][number];

function imlecCoz(imlec: string): { at: Date; id: string } {
  try {
    const [at, id] = Buffer.from(imlec, 'base64url').toString('utf8').split('|');
    const tarih = new Date(at ?? '');
    if (!id || Number.isNaN(tarih.getTime())) throw new Error('imlec');
    return { at: tarih, id };
  } catch {
    throw new AppError(400, errorCodes.validation, 'İmleç geçersiz.');
  }
}

const imlecYaz = (d: { baslangic_at: Date; id: string }) =>
  Buffer.from(`${d.baslangic_at.toISOString()}|${d.id}`, 'utf8').toString('base64url');

/** `YoklamaDurumTipi` ile finans `YoklamaDurumu` ayni dort degerdir. */
const finansDurumu = (d: YoklamaDurumTipi): YoklamaDurumu => d;

/** Yoklama uc noktalari (`/v1/ders/kurumlar/:kurum_id/...`). */
export const yoklamaYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const yaz = { preHandler: requirePermission('yoklama.yaz', { scope: 'grup' }) };
  const oku = { preHandler: requirePermission('yoklama.oku') };

  // --- Toplu yoklama kaydi ---------------------------------------------------------------

  app.put(
    '/kurumlar/:kurum_id/dersler/:id/yoklamalar',
    {
      ...yaz,
      schema: {
        tags: ['ders'],
        summary:
          'Yoklama al/duzelt (toplu, tek islem). `Idempotency-Key` (UUID) zorunlu: ayni anahtar+govde kayitli yaniti `Idempotent-Replayed: true` ile aynen doner, ayni anahtar farkli govde 422. Satir basina `sonuc`: yeni | guncellendi | ayni (icerik ayni, hicbir sey yazilmaz) | eski (istemci saati mevcuttan eski, yazilmaz). Tek satir hata verirse hicbiri yazilmaz. Ilk basarili yazim dersi `tamamlandi` yapar. Gelecek ders 422, iptal ders 409, kilitli ders 403 (yalniz ogretmen).',
        params: dersParam,
        headers: YoklamaBaslikSema,
        body: YoklamaTopluGirdiSema,
        response: { 200: YoklamaKaydetYanitSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const istekId = request.headers['idempotency-key'];
      const baglam = olayBaglami(y, request.correlationId);
      const simdi = new Date();
      const girdiler = request.body.yoklamalar.map(yoklamaGirdisiniNormallestir);
      const sinir = simdi.getTime() + YOKLAMA_SAAT_SAPMASI_DK * DAKIKA_MS;
      if (girdiler.some((g) => g.isaretlenme_at.getTime() > sinir)) {
        throw new AppError(
          422,
          errorCodes.validation,
          'İşaretlenme zamanı sunucu saatinden en fazla 5 dakika ileride olabilir.',
        );
      }
      const ozet = govdeOzeti(request.params.id, y.kullaniciId, girdiler);

      const sonuc = await withTenant(db, kiraci(y), async (tx) => {
        // 1) Istek kimligi: yarisan ayni anahtar ikinci insert'te ilkinin commit'ini bekler.
        const eklenen = await tx
          .insert(yoklamaIstekleri)
          .values({
            id: uuidv7(),
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            istek_id: istekId,
            ders_id: request.params.id,
            kullanici_id: y.kullaniciId,
            govde_sha256: ozet,
            durum_kodu: 0,
            yanit: {},
          })
          .onConflictDoNothing({ target: [yoklamaIstekleri.kurum_id, yoklamaIstekleri.istek_id] })
          .returning({ id: yoklamaIstekleri.id });
        if (eklenen.length === 0) {
          const [kayitli] = await tx
            .select()
            .from(yoklamaIstekleri)
            .where(
              and(eq(yoklamaIstekleri.kurum_id, y.kurumId), eq(yoklamaIstekleri.istek_id, istekId)),
            );
          if (
            kayitli?.kullanici_id !== y.kullaniciId ||
            kayitli.ders_id !== request.params.id ||
            !kayitli.govde_sha256.equals(ozet)
          ) {
            throw new AppError(
              422,
              yoklamaHataKodlari.idempotencyAnahtarCakismasi,
              'Bu Idempotency-Key farklı bir istekle daha önce kullanılmış.',
            );
          }
          return { tekrar: true as const, yanit: kayitli.yanit as KaydetYaniti };
        }

        // 2) Ders: kilitli, kapsamli (ogretmen atandigi gruptaki vekil dersi de alabilir).
        const ders = await dersBul(tx, y, request.params.id, true);
        if (ders.durum === 'iptal') {
          throw new AppError(
            409,
            yoklamaHataKodlari.dersIptalEdildi,
            'İptal edilmiş derse yoklama alınamaz.',
          );
        }
        if (ders.baslangic_at.getTime() > simdi.getTime() + YOKLAMA_SAAT_SAPMASI_DK * DAKIKA_MS) {
          throw new AppError(
            422,
            yoklamaHataKodlari.dersHenuzBaslamadi,
            'Ders henüz başlamadı; gelecekteki derse yoklama alınamaz.',
          );
        }
        await yoklamaKilidiniKontrolEt(tx, y, ders, simdi);
        await grupModuluAcikOlmali(tx, y, 'yoklama', ders.grup_id);

        // 3) Katilimci listesi grup uyeligiyle uyumlu mu (yalniz planli ders).
        await dersKatilimcilariniEsitle(tx, y.kurumId, { dersId: ders.id }, baglam, y.kullaniciId);
        const katilimcilar = await tx
          .select({ ogrenci_id: dersKatilimcilari.ogrenci_id })
          .from(dersKatilimcilari)
          .where(
            and(
              eq(dersKatilimcilari.ders_id, ders.id),
              inArray(
                dersKatilimcilari.ogrenci_id,
                girdiler.map((g) => g.ogrenci_id),
              ),
            ),
          );
        const katilimciKumesi = new Set(katilimcilar.map((k) => k.ogrenci_id));
        const katilimciOlmayanlar = girdiler
          .map((g) => g.ogrenci_id)
          .filter((id) => !katilimciKumesi.has(id));
        if (katilimciOlmayanlar.length > 0) {
          throw new AppError(
            422,
            yoklamaHataKodlari.ogrenciKatilimciDegil,
            'Bazı öğrenciler bu dersin katılımcısı değil.',
            { ogrenci_idleri: katilimciOlmayanlar },
          );
        }

        // 4) Satirlar (mevcutlar kilitli).
        const mevcutlar = new Map(
          (
            await tx
              .select()
              .from(yoklamalar)
              .where(
                and(
                  eq(yoklamalar.ders_id, ders.id),
                  inArray(
                    yoklamalar.ogrenci_id,
                    girdiler.map((g) => g.ogrenci_id),
                  ),
                ),
              )
              .for('update')
          ).map((m) => [m.ogrenci_id, m]),
        );
        const saatDilimi = await kurumSaatDilimi(tx, y.kurumId);
        const dersYerelTarih = utcdenYerel(ders.baslangic_at, saatDilimi).tarih;
        const [grup] = await tx
          .select({ tur: gruplar.tur })
          .from(gruplar)
          .where(and(eq(gruplar.id, ders.grup_id), eq(gruplar.kurum_id, y.kurumId)));

        const sonuclar: Sonuc[] = [];
        let degisen = 0;
        for (const g of girdiler) {
          const mevcut = mevcutlar.get(g.ogrenci_id);
          if (mevcut && g.isaretlenme_at.getTime() < mevcut.isaretlenme_at.getTime()) {
            sonuclar.push(sonucSatiri(g.ogrenci_id, 'eski', mevcut));
            continue;
          }
          if (mevcut && ayniIcerik(mevcut, g)) {
            sonuclar.push(sonucSatiri(g.ogrenci_id, 'ayni', mevcut));
            continue;
          }
          const satir = await yoklamaYaz(tx, {
            kurumId: y.kurumId,
            kullaniciId: y.kullaniciId,
            isaretleyenId: y.uyelikId,
            istekId,
            mevcut,
            g,
            dersId: ders.id,
          });
          const finans = await krediVeUcretiUygula(tx, {
            kurumId: y.kurumId,
            dersId: ders.id,
            ogrenciId: g.ogrenci_id,
            dersYerelTarih,
            grupId: ders.grup_id,
            bransKodu: ders.brans_kodu,
            grupTuru: grup?.tur ?? null,
            aktorKullaniciId: y.kullaniciId,
            correlationId: request.correlationId,
            yoklamaId: satir.id,
            yoklamaSurumu: satir.surum,
            durum: finansDurumu(g.durum),
          });
          // Olay durum degisimi icindir; yalniz not ya da gec dakikasi degistiyse tuketiciyi ilgilendirmez.
          if (mevcut?.durum !== g.durum) {
            await yoklamaOlayiYaz(
              tx,
              baglam,
              ders,
              satir,
              (mevcut?.durum as YoklamaDurumTipi | undefined) ?? null,
            );
          }
          degisen++;
          sonuclar.push(
            sonucSatiri(g.ogrenci_id, mevcut ? 'guncellendi' : 'yeni', satir, {
              kalan_kredi: finans.kalan_kredi ?? null,
              uyari: finans.uyari ?? null,
            }),
          );
        }

        // 5) Ilk basarili yazimda ders tamamlanir.
        let dersDurumu = ders.durum as KaydetYaniti['ders_durumu'];
        if (degisen > 0 && ders.durum === 'planli') {
          const [tamam] = await tx
            .update(dersler)
            .set({ durum: 'tamamlandi' })
            .where(eq(dersler.id, ders.id))
            .returning();
          if (!tamam) throw new Error('ders tamamlanamadı');
          await dersOlayiYaz(tx, baglam, 'tamamlandi', tamam, await katilimciIdleri(tx, ders.id));
          dersDurumu = 'tamamlandi';
        }

        // 6) Tek denetim kaydi (not metni yok) ve istek yaniti.
        await dersDenetimiYaz(tx, y, request.ip, 'ders.yoklama_kaydet', 'ders', ders.id, null, {
          gelen_satir_sayisi: girdiler.length,
          etkilenen_sayisi: degisen,
          sonuclar: {
            yeni: sonuclar.filter((s) => s.sonuc === 'yeni').length,
            guncellendi: sonuclar.filter((s) => s.sonuc === 'guncellendi').length,
            ayni: sonuclar.filter((s) => s.sonuc === 'ayni').length,
            eski: sonuclar.filter((s) => s.sonuc === 'eski').length,
          },
        });
        const yanit: KaydetYaniti = { ders_id: ders.id, ders_durumu: dersDurumu, sonuclar };
        await tx
          .update(yoklamaIstekleri)
          .set({ durum_kodu: 200, yanit })
          .where(
            and(eq(yoklamaIstekleri.kurum_id, y.kurumId), eq(yoklamaIstekleri.istek_id, istekId)),
          );
        return { tekrar: false as const, yanit };
      });
      if (sonuc.tekrar) void reply.header('Idempotent-Replayed', 'true');
      return reply.status(200).send(sonuc.yanit);
    },
  );

  // --- Ders yoklama listesi --------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/dersler/:id/yoklamalar',
    {
      ...oku,
      schema: {
        tags: ['ders'],
        summary:
          'Dersin katilimcilari ve (varsa) yoklamalari; yoklamasi olmayan katilimci da listelenir. Personel tum katilimcilari gorur; ogrenci yalniz kendisini ve `ogretmene_ozel` notu hic gormez. Liste grup uyeligiyle esitlenir (planli ders).',
        params: dersParam,
        response: { 200: YoklamaListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const baglam = olayBaglami(y, request.correlationId);
      const ogrenciGorunumu = y.kapsam === 'kendi';
      return withTenant(db, kiraci(y), async (tx) => {
        // Esitleme once: gruba sonradan katilan ogrenci kendi dersini ancak boylece gorur.
        await dersKatilimcilariniEsitle(
          tx,
          y.kurumId,
          { dersId: request.params.id },
          baglam,
          y.kullaniciId,
        );
        const ders = await dersBul(tx, y, request.params.id);
        const satirlar = await tx
          .select({ ogrenci_id: dersKatilimcilari.ogrenci_id, tur: dersKatilimcilari.tur })
          .from(dersKatilimcilari)
          .where(
            and(
              eq(dersKatilimcilari.ders_id, ders.id),
              ogrenciGorunumu ? eq(dersKatilimcilari.ogrenci_id, y.uyelikId) : undefined,
            ),
          )
          .orderBy(asc(dersKatilimcilari.id));
        const idler = satirlar.map((s) => s.ogrenci_id);
        const yoklamaSatirlari =
          idler.length === 0
            ? []
            : await tx
                .select()
                .from(yoklamalar)
                .where(and(eq(yoklamalar.ders_id, ders.id), inArray(yoklamalar.ogrenci_id, idler)));
        const harita = new Map(yoklamaSatirlari.map((s) => [s.ogrenci_id, s]));
        const adlar = await gorunenAdlar(tx, idler);
        return {
          ders: {
            id: ders.id,
            grup_id: ders.grup_id,
            baslangic_at: ders.baslangic_at.toISOString(),
            bitis_at: ders.bitis_at.toISOString(),
            durum: ders.durum as 'planli' | 'tamamlandi' | 'iptal',
          },
          katilimcilar: satirlar.map((s) => {
            const yoklama = harita.get(s.ogrenci_id);
            return {
              ogrenci_id: s.ogrenci_id,
              tur: s.tur as 'uye' | 'misafir' | 'telafi',
              gorunen_ad: adlar.get(s.ogrenci_id) ?? null,
              yoklama: yoklama ? yoklamaYaniti(yoklama, ogrenciGorunumu) : null,
            };
          }),
        };
      });
    },
  );

  // --- Yoklama bekleyen dersler ----------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/yoklama-bekleyen',
    {
      ...yaz,
      schema: {
        tags: ['ders'],
        summary:
          'Ogretmenin "Yoklama al" listesi: baslamis, `planli`, en az bir katilimcisinin yoklamasi eksik dersler (son 14 gun; kapsam suzgecli; `baslangic_at` azalan; imlecle sayfali).',
        params: kurumParam,
        querystring: YoklamaBekleyenSorguSema,
        response: { 200: YoklamaBekleyenYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { limit, imlec } = request.query;
      const simdi = new Date();
      return withTenant(db, kiraci(y), async (tx) => {
        // Secim listesinde Drizzle sutunu niteliksiz yazar; alt sorguda `id` belirsiz kalmasin diye elle nitelenir.
        const eksik = sql<number>`(select count(*)::int from ders.ders_katilimcilari dk
          where dk.ders_id = "ders"."dersler"."id"
            and not exists (select 1 from ders.yoklamalar yk
                            where yk.ders_id = dk.ders_id and yk.ogrenci_id = dk.ogrenci_id))`;
        const kosullar = [
          eq(dersler.kurum_id, y.kurumId),
          dersKapsami(tx, y),
          eq(dersler.durum, 'planli'),
          lte(dersler.baslangic_at, simdi),
          gte(dersler.baslangic_at, new Date(simdi.getTime() - YOKLAMA_BEKLEYEN_GUN * GUN_MS)),
          exists(
            tx
              .select({ bir: sql`1` })
              .from(dersKatilimcilari)
              .where(
                and(
                  eq(dersKatilimcilari.ders_id, dersler.id),
                  sql`not exists (select 1 from ders.yoklamalar yk
                      where yk.ders_id = ${dersKatilimcilari.ders_id}
                        and yk.ogrenci_id = ${dersKatilimcilari.ogrenci_id})`,
                ),
              ),
          ),
        ];
        if (imlec) {
          const c = imlecCoz(imlec);
          kosullar.push(
            sql`(${dersler.baslangic_at}, ${dersler.id}) < (${c.at.toISOString()}::timestamptz, ${c.id}::uuid)`,
          );
        }
        const satirlar = await tx
          .select({ ders: dersler, eksik })
          .from(dersler)
          .where(and(...kosullar))
          .orderBy(desc(dersler.baslangic_at), desc(dersler.id))
          .limit(limit + 1);
        const sayfa = satirlar.slice(0, limit);
        const sayilar = await katilimciSayilari(
          tx,
          sayfa.map((s) => s.ders.id),
        );
        const son = sayfa.at(-1);
        return {
          dersler: sayfa.map((s) => ({
            ...dersYaniti(s.ders, sayilar.get(s.ders.id) ?? 0),
            yoklamasi_eksik_sayisi: s.eksik,
          })),
          sonraki_imlec: satirlar.length > limit && son ? imlecYaz(son.ders) : null,
        };
      });
    },
  );

  return Promise.resolve();
};

function sonucSatiri(
  ogrenciId: string,
  sonuc: Sonuc['sonuc'],
  satir: YoklamaSatiri,
  finans: { kalan_kredi: number | null; uyari: 'ucret_tarifesi_yok' | null } = {
    kalan_kredi: null,
    uyari: null,
  },
): Sonuc {
  return {
    ogrenci_id: ogrenciId,
    sonuc,
    yoklama: yoklamaYaniti(satir, false),
    kalan_kredi: finans.kalan_kredi,
    uyari: finans.uyari,
  };
}

/** Yoklama satirini yazar (yeni ya da guncelleme) ve degistirilemez gecmise satir ekler. */
async function yoklamaYaz(
  tx: Tx,
  a: {
    kurumId: string;
    kullaniciId: string;
    isaretleyenId: string;
    istekId: string;
    mevcut: YoklamaSatiri | undefined;
    g: YoklamaGirdisi;
    dersId: string;
  },
): Promise<YoklamaSatiri> {
  const { g, mevcut } = a;
  const alanlar = {
    durum: g.durum,
    gec_dakika: g.gec_dakika,
    not: g.not,
    not_gorunurluk: g.not_gorunurluk,
    isaretleyen_id: a.isaretleyenId,
    isaretlenme_at: g.isaretlenme_at,
  };
  const [satir] = mevcut
    ? await tx
        .update(yoklamalar)
        .set({ ...alanlar, sunucu_at: sql`now()` })
        .where(eq(yoklamalar.id, mevcut.id))
        .returning()
    : await tx
        .insert(yoklamalar)
        .values({
          id: uuidv7(),
          kurum_id: a.kurumId,
          created_by: a.kullaniciId,
          ders_id: a.dersId,
          ogrenci_id: g.ogrenci_id,
          ...alanlar,
        })
        .returning();
  if (!satir) throw new Error('yoklama yazılamadı');
  await tx.insert(yoklamaGecmisi).values({
    id: uuidv7(),
    kurum_id: a.kurumId,
    created_by: a.kullaniciId,
    yoklama_id: satir.id,
    ders_id: a.dersId,
    ogrenci_id: g.ogrenci_id,
    yoklama_surumu: satir.surum,
    onceki_durum: mevcut?.durum ?? null,
    yeni_durum: g.durum,
    degistiren_id: a.isaretleyenId,
    istek_id: a.istekId,
    istemci_zamani: g.isaretlenme_at,
  });
  return satir;
}
