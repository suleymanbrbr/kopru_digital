import {
  GERI_BILDIRIM_PENCERE_SAAT,
  GeriBildirimBekleyenYanitSema,
  GeriBildirimDersYanitSema,
  GeriBildirimGirdiSema,
  GeriBildirimKaydetYanitSema,
  GeriBildirimKendiYanitSema,
  GeriBildirimOgrenciSorguSema,
  GeriBildirimOgrenciYanitSema,
  GeriBildirimOzetSorguSema,
  GeriBildirimOzetYanitSema,
  dersGeriBildirimVerildiV1,
  errorCodes,
  geriBildirimHataKodlari,
  yoklamaHataKodlari,
  type GeriBildirimDeger,
} from '@kopru/contracts';
import { AppError, publishInTx, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { and, desc, eq, exists, gt, inArray, lte, ne, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import {
  dersKatilimcilari,
  dersler,
  geriBildirimler,
  uyelikler,
  yoklamalar,
} from '../../db/schema.js';
import { gorunenAdlar, modulAcikMi, requirePermission, type YetkiBaglami } from '../hesap/index.js';
import { OUTBOX_TABLOSU, dersBul, dersKapsami } from './ders-deposu.js';
import {
  dersParam,
  grupModuluAcikOlmali,
  kiraci,
  kurumParam,
  kurumSaatDilimi,
  olayBaglami,
  yetkiAl,
} from './ders-ortak.js';
import { MIKROSANIYE_ISO, imlecCoz, imlecYaz } from './imlec.js';
import { tarihEkle, yerelDenUtc } from './zaman.js';

const SAAT_MS = 3_600_000;
const PENCERE_MS = GERI_BILDIRIM_PENCERE_SAAT * SAAT_MS;

type Satir = typeof geriBildirimler.$inferSelect;

const yanit = (g: Satir) => ({
  id: g.id,
  ders_id: g.ders_id,
  ogrenci_id: g.ogrenci_id,
  deger: g.deger as GeriBildirimDeger,
  konu_id: g.konu_id,
  not: g.not,
  created_at: g.created_at.toISOString(),
  updated_at: g.updated_at.toISOString(),
});

const sayilar = (satirlar: readonly { deger: string; n: number }[]) => {
  const s = { anladim: 0, kismen: 0, anlamadim: 0, toplam: 0 };
  for (const r of satirlar) {
    if (r.deger === 'anladim' || r.deger === 'kismen' || r.deger === 'anlamadim') {
      s[r.deger] += r.n;
      s.toplam += r.n;
    }
  }
  return s;
};

const oranli = (s: ReturnType<typeof sayilar>) => {
  const oran = (n: number) => (s.toplam === 0 ? 0 : Math.round((n / s.toplam) * 10_000) / 10_000);
  return {
    ...s,
    oran: { anladim: oran(s.anladim), kismen: oran(s.kismen), anlamadim: oran(s.anlamadim) },
  };
};

/** Geri bildirim ogrenci uyeligiyle verilir; personel uyelikleri (sahip dahil) veremez. */
function ogrenciOlmali(y: YetkiBaglami): void {
  if (y.rol !== 'ogrenci') {
    throw new AppError(403, errorCodes.izinYok, 'Geri bildirimi yalnızca öğrenci verebilir.');
  }
}

/** Grubunda `geri_bildirim` modulu kapali olan derslerin kimlikleri disarida birakilir. */
async function kapaliGruplar(tx: Tx, y: YetkiBaglami, grupIdleri: readonly string[]) {
  const kapali = new Set<string>();
  for (const g of new Set(grupIdleri)) {
    if (!(await modulAcikMi(tx, y.kurumId, 'geri_bildirim', { grupId: g }))) kapali.add(g);
  }
  return kapali;
}

/** Geri bildirim uc noktalari (`/v1/ders/kurumlar/:kurum_id/...`). */
export const geriBildirimYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const ver = { preHandler: requirePermission('geri_bildirim.ver') };
  const oku = { preHandler: requirePermission('geri_bildirim.oku', { scope: 'grup' }) };
  const okuSube = { preHandler: requirePermission('geri_bildirim.oku', { scope: 'sube' }) };

  // --- Ogrenci: ver / guncelle -----------------------------------------------------------

  app.put(
    '/kurumlar/:kurum_id/dersler/:id/geri-bildirim',
    {
      ...ver,
      schema: {
        tags: ['ders'],
        summary:
          'Ders sonu geri bildirimi ver/guncelle (ogrenci). Kosullar: `geri_bildirim` modulu (grup duzeyi dahil) acik, ders bitmis ve iptal degil, ogrencinin yoklamasi `geldi`/`gec`. Ikinci gonderim gunceller (dersin bitisinden sonra 24 saat icinde; sonra 422). `ders.geri_bildirim.verildi.v1` yalniz ilk verista yayimlanir.',
        params: dersParam,
        body: GeriBildirimGirdiSema,
        response: { 200: GeriBildirimKaydetYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y);
      const g = request.body;
      const baglam = olayBaglami(y, request.correlationId);
      return withTenant(db, kiraci(y), async (tx) => {
        const ders = await dersBul(tx, y, request.params.id);
        await grupModuluAcikOlmali(tx, y, 'geri_bildirim', ders.grup_id);
        if (ders.durum === 'iptal') {
          throw new AppError(
            409,
            yoklamaHataKodlari.dersIptalEdildi,
            'İptal edilmiş derse geri bildirim verilemez.',
          );
        }
        const simdi = Date.now();
        if (ders.bitis_at.getTime() > simdi) {
          throw new AppError(
            422,
            geriBildirimHataKodlari.dersBitmedi,
            'Ders henüz bitmedi; geri bildirim ders bittikten sonra verilir.',
          );
        }
        const [yoklama] = await tx
          .select({ durum: yoklamalar.durum })
          .from(yoklamalar)
          .where(and(eq(yoklamalar.ders_id, ders.id), eq(yoklamalar.ogrenci_id, y.uyelikId)));
        if (yoklama?.durum !== 'geldi' && yoklama?.durum !== 'gec') {
          throw new AppError(
            422,
            geriBildirimHataKodlari.yoklamaUygunDegil,
            'Geri bildirim yalnızca derse katılan (geldi/geç) öğrenci tarafından verilir.',
          );
        }
        const alanlar = { deger: g.deger, konu_id: g.konu_id ?? null, not: g.not ?? null };

        // Ilk veris: yaris durumunda ikinci insert ilkinin commit'ini bekler ve `DO NOTHING` ile duser.
        const [eklenen] = await tx
          .insert(geriBildirimler)
          .values({
            id: uuidv7(),
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            ders_id: ders.id,
            ogrenci_id: y.uyelikId,
            ...alanlar,
          })
          .onConflictDoNothing({ target: [geriBildirimler.ders_id, geriBildirimler.ogrenci_id] })
          .returning();
        if (eklenen) {
          await publishInTx(
            tx,
            dersGeriBildirimVerildiV1.create({
              ...baglam,
              data: {
                geri_bildirim_id: eklenen.id,
                ders_id: ders.id,
                ogrenci_id: y.uyelikId,
                brans_kodu: ders.brans_kodu,
                deger: g.deger,
                konu_id: alanlar.konu_id,
              },
            }),
            { table: OUTBOX_TABLOSU },
          );
          return { geri_bildirim: yanit(eklenen), yeni: true };
        }

        if (simdi > ders.bitis_at.getTime() + PENCERE_MS) {
          throw new AppError(
            422,
            geriBildirimHataKodlari.guncellemeSuresiDoldu,
            'Geri bildirim dersin bitişinden sonra 24 saat içinde değiştirilebilir.',
          );
        }
        const [guncel] = await tx
          .update(geriBildirimler)
          .set(alanlar)
          .where(
            and(eq(geriBildirimler.ders_id, ders.id), eq(geriBildirimler.ogrenci_id, y.uyelikId)),
          )
          .returning();
        if (!guncel) throw new Error('geri bildirim güncellenemedi');
        return { geri_bildirim: yanit(guncel), yeni: false };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/dersler/:id/geri-bildirim',
    {
      ...ver,
      schema: {
        tags: ['ders'],
        summary: 'Ogrencinin bu derse verdigi geri bildirim (yoksa `geri_bildirim: null`).',
        params: dersParam,
        response: { 200: GeriBildirimKendiYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y);
      return withTenant(db, kiraci(y), async (tx) => {
        const ders = await dersBul(tx, y, request.params.id);
        const [g] = await tx
          .select()
          .from(geriBildirimler)
          .where(
            and(eq(geriBildirimler.ders_id, ders.id), eq(geriBildirimler.ogrenci_id, y.uyelikId)),
          );
        return { geri_bildirim: g ? yanit(g) : null };
      });
    },
  );

  // --- Ogrenci: bekleyenler --------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/geri-bildirim/bekleyen',
    {
      ...ver,
      schema: {
        tags: ['ders'],
        summary:
          'Bekleyen geri bildirimler (ogrenci): son 24 saatte biten, iptal olmayan, ogrencinin `geldi`/`gec` oldugu ve henuz geri bildirim vermedigi dersler (grubunda modul kapali olanlar haric). Istemciler Bugun ekraninda kart olarak gosterir; push henuz yok.',
        params: kurumParam,
        response: { 200: GeriBildirimBekleyenYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y);
      const simdi = new Date();
      return withTenant(db, kiraci(y), async (tx) => {
        const satirlar = await tx
          .select()
          .from(dersler)
          .where(
            and(
              eq(dersler.kurum_id, y.kurumId),
              dersKapsami(tx, y),
              ne(dersler.durum, 'iptal'),
              lte(dersler.bitis_at, simdi),
              gt(dersler.bitis_at, new Date(simdi.getTime() - PENCERE_MS)),
              exists(
                tx
                  .select({ bir: sql`1` })
                  .from(yoklamalar)
                  .where(
                    and(
                      eq(yoklamalar.ders_id, dersler.id),
                      eq(yoklamalar.ogrenci_id, y.uyelikId),
                      inArray(yoklamalar.durum, ['geldi', 'gec']),
                    ),
                  ),
              ),
              sql`not exists (select 1 from ders.geri_bildirimler gb
                  where gb.ders_id = ${dersler.id} and gb.ogrenci_id = ${y.uyelikId}::uuid)`,
            ),
          )
          .orderBy(desc(dersler.bitis_at), desc(dersler.id))
          .limit(50);
        const kapali = await kapaliGruplar(
          tx,
          y,
          satirlar.map((s) => s.grup_id),
        );
        return {
          dersler: satirlar
            .filter((d) => !kapali.has(d.grup_id))
            .map((d) => ({
              ders_id: d.id,
              grup_id: d.grup_id,
              ogretmen_id: d.ogretmen_id,
              brans_kodu: d.brans_kodu,
              baslik: d.baslik,
              konu_id: d.konu_id,
              baslangic_at: d.baslangic_at.toISOString(),
              bitis_at: d.bitis_at.toISOString(),
              son_verme_at: new Date(d.bitis_at.getTime() + PENCERE_MS).toISOString(),
            })),
        };
      });
    },
  );

  // --- Personel: ders karti --------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/dersler/:id/geri-bildirimler',
    {
      ...oku,
      schema: {
        tags: ['ders'],
        summary:
          'Dersin geri bildirimleri (ders karti): ogrenci, deger, konu, not ve sayilar. Ogretmen yalniz kendi dersini/atandigi grubu, sahip ve yonetici kapsamindakileri gorur.',
        params: dersParam,
        response: { 200: GeriBildirimDersYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const ders = await dersBul(tx, y, request.params.id);
        await grupModuluAcikOlmali(tx, y, 'geri_bildirim', ders.grup_id);
        const satirlar = await tx
          .select()
          .from(geriBildirimler)
          .where(eq(geriBildirimler.ders_id, ders.id))
          .orderBy(geriBildirimler.created_at, geriBildirimler.id);
        const adlar = await gorunenAdlar(
          tx,
          satirlar.map((s) => s.ogrenci_id),
        );
        const [katilimci] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(dersKatilimcilari)
          .where(eq(dersKatilimcilari.ders_id, ders.id));
        return {
          ders_id: ders.id,
          ozet: sayilar(
            ['anladim', 'kismen', 'anlamadim'].map((d) => ({
              deger: d,
              n: satirlar.filter((s) => s.deger === d).length,
            })),
          ),
          geri_bildirimler: satirlar.map((s) => ({
            ...yanit(s),
            gorunen_ad: adlar.get(s.ogrenci_id) ?? null,
          })),
          katilimci_sayisi: katilimci?.n ?? 0,
        };
      });
    },
  );

  // --- Personel: ogrenci profili ---------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/ogrenciler/:ogrenci_id/geri-bildirimler',
    {
      ...oku,
      schema: {
        tags: ['ders'],
        summary:
          'Ogrencinin son geri bildirimleri (ogrenci profili); yeniden eskiye, imlecle sayfali. Ogretmen yalniz kendi derslerindeki / atandigi gruplardaki geri bildirimleri gorur.',
        params: kurumParam.extend({ ogrenci_id: dersParam.shape.id }),
        querystring: GeriBildirimOgrenciSorguSema,
        response: { 200: GeriBildirimOgrenciYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { limit, imlec } = request.query;
      return withTenant(db, kiraci(y), async (tx) => {
        const [ogrenci] = await tx
          .select({ id: uyelikler.id })
          .from(uyelikler)
          .where(
            and(
              eq(uyelikler.id, request.params.ogrenci_id),
              eq(uyelikler.kurum_id, y.kurumId),
              eq(uyelikler.rol, 'ogrenci'),
            ),
          );
        if (!ogrenci) throw new AppError(404, errorCodes.notFound, 'Öğrenci bulunamadı.');
        const kosullar = [
          eq(geriBildirimler.ogrenci_id, ogrenci.id),
          eq(dersler.kurum_id, y.kurumId),
          dersKapsami(tx, y),
        ];
        if (imlec) {
          const [at, id] = imlecCoz(imlec, 2) as [string, string];
          kosullar.push(
            sql`(${geriBildirimler.created_at}, ${geriBildirimler.id}) < (${at}::timestamptz, ${id}::uuid)`,
          );
        }
        const satirlar = await tx
          .select({
            g: geriBildirimler,
            imlec_at: sql<string>`to_char(${geriBildirimler.created_at} at time zone 'UTC', ${sql.raw(MIKROSANIYE_ISO)})`,
            brans_kodu: dersler.brans_kodu,
            baslangic_at: dersler.baslangic_at,
            bitis_at: dersler.bitis_at,
            ogretmen_id: dersler.ogretmen_id,
            grup_id: dersler.grup_id,
          })
          .from(geriBildirimler)
          .innerJoin(dersler, eq(dersler.id, geriBildirimler.ders_id))
          .where(and(...kosullar))
          .orderBy(desc(geriBildirimler.created_at), desc(geriBildirimler.id))
          .limit(limit + 1);
        const sayfa = satirlar.slice(0, limit);
        const son = sayfa.at(-1);
        return {
          geri_bildirimler: sayfa.map((s) => ({
            ...yanit(s.g),
            brans_kodu: s.brans_kodu,
            ders_baslangic_at: s.baslangic_at.toISOString(),
            ders_bitis_at: s.bitis_at.toISOString(),
            ogretmen_id: s.ogretmen_id,
          })),
          sonraki_imlec: satirlar.length > limit && son ? imlecYaz(son.imlec_at, son.g.id) : null,
        };
      });
    },
  );

  // --- Yonetici: oranlar -----------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/geri-bildirim/ozet',
    {
      ...okuSube,
      schema: {
        tags: ['ders'],
        summary:
          'Tarih araliginda (ders bitis gunu, kurum yerel saati) geri bildirim oranlari: toplam ve ogretmen/brans kirilimi. Yalniz sahip/yonetici (kapsamindaki dersler).',
        params: kurumParam,
        querystring: GeriBildirimOzetSorguSema,
        response: { 200: GeriBildirimOzetYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { baslangic, bitis } = request.query;
      return withTenant(db, kiraci(y), async (tx) => {
        const dilim = await kurumSaatDilimi(tx, y.kurumId);
        const alt = yerelDenUtc(baslangic, '00:00', dilim);
        const ust = yerelDenUtc(tarihEkle(bitis, 1), '00:00', dilim);
        const satirlar = await tx
          .select({
            ogretmen_id: dersler.ogretmen_id,
            brans_kodu: dersler.brans_kodu,
            deger: geriBildirimler.deger,
            n: sql<number>`count(*)::int`,
          })
          .from(geriBildirimler)
          .innerJoin(dersler, eq(dersler.id, geriBildirimler.ders_id))
          .where(
            and(
              eq(dersler.kurum_id, y.kurumId),
              dersKapsami(tx, y),
              sql`${dersler.bitis_at} >= ${alt.toISOString()}::timestamptz`,
              sql`${dersler.bitis_at} < ${ust.toISOString()}::timestamptz`,
            ),
          )
          .groupBy(dersler.ogretmen_id, dersler.brans_kodu, geriBildirimler.deger);
        const grupla = <K extends string>(anahtar: (s: (typeof satirlar)[number]) => K) => {
          const harita = new Map<K, typeof satirlar>();
          for (const s of satirlar) {
            const k = anahtar(s);
            harita.set(k, [...(harita.get(k) ?? []), s]);
          }
          return harita;
        };
        const ogretmenler = grupla((s) => s.ogretmen_id);
        const adlar = await gorunenAdlar(tx, [...ogretmenler.keys()]);
        return {
          baslangic,
          bitis,
          toplam: oranli(sayilar(satirlar)),
          ogretmenler: [...ogretmenler]
            .map(([ogretmenId, s]) => ({
              ogretmen_id: ogretmenId,
              gorunen_ad: adlar.get(ogretmenId) ?? null,
              ...oranli(sayilar(s)),
            }))
            .sort((a, b) => b.toplam - a.toplam || a.ogretmen_id.localeCompare(b.ogretmen_id)),
          branslar: [...grupla((s) => s.brans_kodu)]
            .map(([bransKodu, s]) => ({ brans_kodu: bransKodu, ...oranli(sayilar(s)) }))
            .sort((a, b) => b.toplam - a.toplam || a.brans_kodu.localeCompare(b.brans_kodu)),
        };
      });
    },
  );

  return Promise.resolve();
};
