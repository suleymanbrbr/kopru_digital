import {
  KaynakDersEkleGirdiSema,
  KaynakDetaySema,
  KaynakEkleYanitSema,
  KaynakGuncelleGirdiSema,
  KaynakIzlemeYanitSema,
  KaynakListeYanitSema,
  KaynakMateryalEkleGirdiSema,
  KaynakSilYanitSema,
  KaynakSorunCozYanitSema,
  KaynakSorunListeYanitSema,
  KaynakYonetimSorguSema,
  errorCodes,
  hesapHataKodlari,
  kaynakHataKodlari,
  type KaynakLinkSema,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { type z } from 'zod';

import {
  dersKaynagiAlicilari,
  dersKaynagiIzlemeleri,
  dersKaynagiSorunlari,
  dersKaynaklari,
  dersler,
  gruplar,
} from '../../db/schema.js';
import { gorunenAdlar, grupKapsami, requirePermission, type YetkiBaglami } from '../hesap/index.js';
import { dersBul, dersDenetimiYaz, type DersOlayBaglami, type DersSatiri } from './ders-deposu.js';
import { dersParam, kiraci, kurumParam, olayBaglami, yetkiAl } from './ders-ortak.js';
import { imlecCoz, imlecYaz } from './imlec.js';
import {
  alicilariDogrula,
  alicilariYaz,
  hedefOgrenciler,
  kayitModuluAcikOlmali,
  kaynakEklendiOlayiYaz,
  kaynakTemeli,
  parolaOku,
  personelKapsami,
  personelKaynagiBul,
  personelOlmali,
  sorunYaniti,
  type KaynakDers,
  type KaynakSatiri,
} from './kaynak-deposu.js';
import { olusturmaImleci, suzgecKosullari } from './kaynak-liste.js';
import { parolaSifrele } from './kaynak-sifre.js';
import { kaynakUrlCoz } from './kaynak-url.js';

const kaynakParam = kurumParam.extend({ id: dersParam.shape.id });
const grupParam = kurumParam.extend({ grup_id: dersParam.shape.id });

type Link = z.infer<typeof KaynakLinkSema>;

interface HazirLink {
  baslik: string;
  url: string;
  saglayici: ReturnType<typeof kaynakUrlCoz>['saglayici'];
  parola: string | null;
  parola_sifreli: Buffer | null;
  gecerlilik_bitis_at: Date | null;
  konu_id: string | null;
}

/** Gecerlilik bitisi gelecekte olmali (gecmis tarihli kaynak hic gorunmez). */
function gelecekTarih(deger: string): Date {
  const t = new Date(deger);
  if (t.getTime() <= Date.now()) {
    throw new AppError(422, kaynakHataKodlari.suresiGecmis, 'Son erişim tarihi gelecekte olmalı.', {
      alan: 'gecerlilik_bitis_at',
    });
  }
  return t;
}

/** Veritabanina gitmeden once: url + saglayici, tarih ve parola sifreleme (anahtar yoksa 503). */
function linkleriHazirla(linkler: readonly Link[]): HazirLink[] {
  return linkler.map((l) => {
    const { url, saglayici } = kaynakUrlCoz(l.url);
    return {
      baslik: l.baslik,
      url,
      saglayici,
      parola: l.parola ?? null,
      parola_sifreli: l.parola ? parolaSifrele(l.parola) : null,
      gecerlilik_bitis_at: l.gecerlilik_bitis_at ? gelecekTarih(l.gecerlilik_bitis_at) : null,
      konu_id: l.konu_id ?? null,
    };
  });
}

/** Birden cok kaynagin izleyen ve acik sorun sayilari (N+1 yok). */
async function kaynakSayilari(tx: Tx, idler: readonly string[]) {
  const sonuc = new Map<string, { izleyen: number; sorun: number }>(
    idler.map((id) => [id, { izleyen: 0, sorun: 0 }]),
  );
  if (idler.length === 0) return sonuc;
  const [izl, sor] = await Promise.all([
    tx
      .select({ id: dersKaynagiIzlemeleri.kaynak_id, n: sql<number>`count(*)::int` })
      .from(dersKaynagiIzlemeleri)
      .where(inArray(dersKaynagiIzlemeleri.kaynak_id, [...idler]))
      .groupBy(dersKaynagiIzlemeleri.kaynak_id),
    tx
      .select({ id: dersKaynagiSorunlari.kaynak_id, n: sql<number>`count(*)::int` })
      .from(dersKaynagiSorunlari)
      .where(
        and(
          inArray(dersKaynagiSorunlari.kaynak_id, [...idler]),
          eq(dersKaynagiSorunlari.durum, 'acik'),
        ),
      )
      .groupBy(dersKaynagiSorunlari.kaynak_id),
  ]);
  for (const r of izl) {
    const s = sonuc.get(r.id);
    if (s) s.izleyen = r.n;
  }
  for (const r of sor) {
    const s = sonuc.get(r.id);
    if (s) s.sorun = r.n;
  }
  return sonuc;
}

/** Personel yaniti: parola dahil (yetkili personel), alicilar yalniz `secili_ogrenciler`de. */
async function detayYaniti(tx: Tx, k: KaynakSatiri, d: KaynakDers, parola?: string | null) {
  const sayi = (await kaynakSayilari(tx, [k.id])).get(k.id);
  const alicilar = k.gorunurluk === 'secili_ogrenciler' ? await hedefOgrenciler(tx, k) : null;
  return {
    ...kaynakTemeli(k, d),
    izleyen_sayisi: sayi?.izleyen ?? 0,
    acik_sorun_sayisi: sayi?.sorun ?? 0,
    parola: parola === undefined ? parolaOku(k) : parola,
    ogrenci_idleri: alicilar,
  };
}

interface EkleGirdisi {
  ders: DersSatiri | null;
  grupId: string;
  tur: 'kayit' | 'materyal';
  hazir: HazirLink[];
  gorunurluk: 'ogretmen' | 'grup' | 'secili_ogrenciler';
  ogrenciIdleri: readonly string[];
}

async function kaynaklariEkle(
  tx: Tx,
  y: YetkiBaglami,
  ip: string,
  baglam: DersOlayBaglami,
  a: EkleGirdisi,
) {
  const alicilar =
    a.gorunurluk === 'secili_ogrenciler'
      ? await alicilariDogrula(tx, {
          dersId: a.ders?.id ?? null,
          grupId: a.grupId,
          ogrenciIdleri: a.ogrenciIdleri,
        })
      : [];
  const satirlar = await tx
    .insert(dersKaynaklari)
    .values(
      a.hazir.map((h) => ({
        id: uuidv7(),
        kurum_id: y.kurumId,
        created_by: y.kullaniciId,
        tur: a.tur,
        ders_id: a.ders?.id ?? null,
        grup_id: a.grupId,
        baslik: h.baslik,
        saglayici: h.saglayici,
        url: h.url,
        parola_sifreli: h.parola_sifreli,
        gecerlilik_bitis_at: h.gecerlilik_bitis_at,
        gorunurluk: a.gorunurluk,
        konu_id: h.konu_id,
        ekleyen_id: y.uyelikId,
      })),
    )
    .returning();
  const bilgi: KaynakDers = {
    ders_baslangic_at: a.ders?.baslangic_at ?? null,
    brans_kodu: a.ders?.brans_kodu ?? null,
    ders_ogretmen_id: a.ders?.ogretmen_id ?? null,
  };
  const sonuc = [];
  for (const [i, k] of satirlar.entries()) {
    await alicilariYaz(tx, y, k.id, alicilar);
    // Gorunurluk ogrencilere aciksa ekleme anindaki olay (alicisi yoksa yayimlanmaz).
    if (k.gorunurluk !== 'ogretmen') await kaynakEklendiOlayiYaz(tx, baglam, k, bilgi.brans_kodu);
    sonuc.push({
      ...kaynakTemeli(k, bilgi),
      izleyen_sayisi: 0,
      acik_sorun_sayisi: 0,
      parola: a.hazir[i]?.parola ?? null,
      ogrenci_idleri: a.gorunurluk === 'secili_ogrenciler' ? alicilar : null,
    });
  }
  await dersDenetimiYaz(
    tx,
    y,
    ip,
    'kaynak.ekle',
    'ders_kaynagi',
    satirlar[0]?.id ?? uuidv7(),
    null,
    {
      adet: satirlar.length,
      tur: a.tur,
      gorunurluk: a.gorunurluk,
      ders_id: a.ders?.id ?? null,
      grup_id: a.grupId,
    },
  );
  return sonuc;
}

/** Personel uc noktalari: kayit/materyal ekleme, listeleme, duzenleme, silme, izleme ve sorunlar. */
export const kaynakYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const yaz = { preHandler: requirePermission('kayit.yaz', { scope: 'grup' }) };
  const oku = { preHandler: requirePermission('kayit.oku', { scope: 'grup' }) };

  // --- Ekleme ----------------------------------------------------------------------------

  app.post(
    '/kurumlar/:kurum_id/dersler/:id/kaynaklar',
    {
      ...yaz,
      schema: {
        tags: ['ders'],
        summary:
          'Derse bir ya da birden cok kayit/materyal baglantisi ekle (tek istek, tek islem). Saglayici alan adindan taninir; yalniz https; Zoom parolasi AES-256-GCM ile sifrelenir. Gorunurluk ogrencilere aciksa `ders.kaynak.eklendi.v1` yayimlanir. Ogretmen yalniz kendi dersine ekler; iptal derse 409.',
        params: dersParam,
        body: KaynakDersEkleGirdiSema,
        response: { 201: KaynakEkleYanitSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      const hazir = linkleriHazirla(g.linkler);
      const baglam = olayBaglami(y, request.correlationId);
      const kaynaklar = await withTenant(db, kiraci(y), async (tx) => {
        const ders = await dersBul(tx, y, request.params.id);
        if (y.rol === 'ogretmen' && ders.ogretmen_id !== y.uyelikId) {
          throw new AppError(
            403,
            errorCodes.izinYok,
            'Yalnızca kendi dersinize kayıt ekleyebilirsiniz.',
          );
        }
        await kayitModuluAcikOlmali(tx, y, ders.grup_id);
        if (ders.durum === 'iptal') {
          throw new AppError(
            409,
            kaynakHataKodlari.dersIptal,
            'İptal edilmiş derse kayıt eklenemez.',
          );
        }
        return kaynaklariEkle(tx, y, request.ip, baglam, {
          ders,
          grupId: ders.grup_id,
          tur: g.tur,
          hazir,
          gorunurluk: g.gorunurluk,
          ogrenciIdleri: g.ogrenci_idleri ?? [],
        });
      });
      return reply.code(201).send({ kaynaklar });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/gruplar/:grup_id/materyaller',
    {
      ...yaz,
      schema: {
        tags: ['ders'],
        summary:
          'Gruba dersten bagimsiz materyal baglantisi ekle (PDF, Drive klasoru, konu anlatim videosu). Ogretmen yalniz atandigi gruba ekler (kapsam disi 404).',
        params: grupParam,
        body: KaynakMateryalEkleGirdiSema,
        response: { 201: KaynakEkleYanitSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      const hazir = linkleriHazirla(g.linkler);
      const baglam = olayBaglami(y, request.correlationId);
      const kaynaklar = await withTenant(db, kiraci(y), async (tx) => {
        const [grup] = await tx
          .select()
          .from(gruplar)
          .where(
            and(
              eq(gruplar.id, request.params.grup_id),
              eq(gruplar.kurum_id, y.kurumId),
              grupKapsami(tx, y),
            ),
          );
        if (!grup) throw new AppError(404, errorCodes.notFound, 'Grup bulunamadı.');
        if (grup.durum !== 'aktif') {
          throw new AppError(
            409,
            hesapHataKodlari.grupArsivde,
            'Arşivlenmiş gruba materyal eklenemez.',
          );
        }
        await kayitModuluAcikOlmali(tx, y, grup.id);
        return kaynaklariEkle(tx, y, request.ip, baglam, {
          ders: null,
          grupId: grup.id,
          tur: 'materyal',
          hazir,
          gorunurluk: g.gorunurluk,
          ogrenciIdleri: g.ogrenci_idleri ?? [],
        });
      });
      return reply.code(201).send({ kaynaklar });
    },
  );

  // --- Listeleme ve okuma ----------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/kaynaklar',
    {
      ...oku,
      schema: {
        tags: ['ders'],
        summary:
          'Personel kaynak listesi (yeniden eskiye, imlecli). Ogretmen atandigi gruplarin ve kendi ekledigi kaynaklari, sahip/yonetici kapsamindakilerin hepsini gorur. Suzgecler: tur, grup, brans, ders, konu, durum, tarih. Parola donmez; `izleyen_sayisi` ve `acik_sorun_sayisi` satirdadir.',
        params: kurumParam,
        querystring: KaynakYonetimSorguSema,
        response: { 200: KaynakListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      personelOlmali(y);
      const { limit, imlec, durum, ...suzgec } = request.query;
      return withTenant(db, kiraci(y), async (tx) => {
        const kosullar = [
          eq(dersKaynaklari.kurum_id, y.kurumId),
          personelKapsami(tx, y),
          ...(await suzgecKosullari(tx, y.kurumId, suzgec)),
        ];
        if (durum) kosullar.push(eq(dersKaynaklari.durum, durum));
        if (imlec) {
          const [at, id] = imlecCoz(imlec, 2) as [string, string];
          kosullar.push(
            sql`(${dersKaynaklari.created_at}, ${dersKaynaklari.id}) < (${at}::timestamptz, ${id}::uuid)`,
          );
        }
        const satirlar = await tx
          .select({
            k: dersKaynaklari,
            imlec_at: olusturmaImleci,
            ders_baslangic_at: dersler.baslangic_at,
            brans_kodu: dersler.brans_kodu,
            ders_ogretmen_id: dersler.ogretmen_id,
          })
          .from(dersKaynaklari)
          .leftJoin(dersler, eq(dersler.id, dersKaynaklari.ders_id))
          .where(and(...kosullar))
          .orderBy(desc(dersKaynaklari.created_at), desc(dersKaynaklari.id))
          .limit(limit + 1);
        const sayfa = satirlar.slice(0, limit);
        const sayilar = await kaynakSayilari(
          tx,
          sayfa.map((s) => s.k.id),
        );
        const son = sayfa.at(-1);
        return {
          kaynaklar: sayfa.map((s) => ({
            ...kaynakTemeli(s.k, s),
            izleyen_sayisi: sayilar.get(s.k.id)?.izleyen ?? 0,
            acik_sorun_sayisi: sayilar.get(s.k.id)?.sorun ?? 0,
          })),
          sonraki_imlec: satirlar.length > limit && son ? imlecYaz(son.imlec_at, son.k.id) : null,
        };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/kaynaklar/:id',
    {
      ...oku,
      schema: {
        tags: ['ders'],
        summary:
          'Tekil kaynak (personel). Parola yetkili personele (ekleyen/atanmis ogretmen, sahip, yonetici) duz metin doner; alicilar `secili_ogrenciler`de listelenir.',
        params: kaynakParam,
        response: { 200: KaynakDetaySema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      personelOlmali(y);
      return withTenant(db, kiraci(y), async (tx) => {
        const { k, d } = await personelKaynagiBul(tx, y, request.params.id);
        return detayYaniti(tx, k, d);
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/kaynaklar/:id/izlemeler',
    {
      ...oku,
      schema: {
        tags: ['ders'],
        summary:
          'Kaynagi kimin izledigi: izleyenler (zamaniyla) ve izlemeyenler (hedef kitleden). Hedef: ders katilimcilari / grubun etkin uyeleri / secili alicilar; `ogretmen` gorunurlugunde hedef yoktur.',
        params: kaynakParam,
        response: { 200: KaynakIzlemeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      personelOlmali(y);
      return withTenant(db, kiraci(y), async (tx) => {
        const { k } = await personelKaynagiBul(tx, y, request.params.id);
        const [hedefler, izlemeler] = await Promise.all([
          hedefOgrenciler(tx, k),
          tx
            .select({
              ogrenci_id: dersKaynagiIzlemeleri.ogrenci_id,
              izledi_at: dersKaynagiIzlemeleri.izledi_at,
            })
            .from(dersKaynagiIzlemeleri)
            .where(eq(dersKaynagiIzlemeleri.kaynak_id, k.id))
            .orderBy(desc(dersKaynagiIzlemeleri.izledi_at), dersKaynagiIzlemeleri.id),
        ]);
        const izleyenler = new Set(izlemeler.map((i) => i.ogrenci_id));
        const izlemeyenIdleri = hedefler.filter((id) => !izleyenler.has(id));
        const adlar = await gorunenAdlar(tx, [...izleyenler, ...izlemeyenIdleri]);
        return {
          kaynak_id: k.id,
          hedef_sayisi: new Set([...hedefler, ...izleyenler]).size,
          izleyenler: izlemeler.map((i) => ({
            ogrenci_id: i.ogrenci_id,
            gorunen_ad: adlar.get(i.ogrenci_id) ?? null,
            izledi_at: i.izledi_at.toISOString(),
          })),
          izlemeyenler: izlemeyenIdleri.map((id) => ({
            ogrenci_id: id,
            gorunen_ad: adlar.get(id) ?? null,
          })),
        };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/kaynaklar/:id/sorunlar',
    {
      ...oku,
      schema: {
        tags: ['ders'],
        summary: '"Acilmiyor" bildirimleri (acik olanlar once, yeniden eskiye).',
        params: kaynakParam,
        response: { 200: KaynakSorunListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      personelOlmali(y);
      return withTenant(db, kiraci(y), async (tx) => {
        const { k } = await personelKaynagiBul(tx, y, request.params.id);
        const satirlar = await tx
          .select()
          .from(dersKaynagiSorunlari)
          .where(eq(dersKaynagiSorunlari.kaynak_id, k.id))
          .orderBy(
            sql`(${dersKaynagiSorunlari.durum} = 'acik') desc`,
            desc(dersKaynagiSorunlari.created_at),
            desc(dersKaynagiSorunlari.id),
          );
        const adlar = await gorunenAdlar(
          tx,
          satirlar.map((s) => s.bildiren_id),
        );
        return {
          sorunlar: satirlar.map((s) => ({
            ...sorunYaniti(s),
            bildiren_ad: adlar.get(s.bildiren_id) ?? null,
          })),
        };
      });
    },
  );

  // --- Duzenleme, gizleme, silme ---------------------------------------------------------

  app.patch(
    '/kurumlar/:kurum_id/kaynaklar/:id',
    {
      ...yaz,
      schema: {
        tags: ['ders'],
        summary:
          'Kaynagi duzenle ya da gizle (`durum: gizli`). `bozuk` bir kaynak guncellenince `aktif`e doner ve acik bildirimler cozulur; `suresi_doldu` kaynagin son erisim tarihi uzatilinca `aktif`e doner. Yalniz ekleyen / grubuna atanmis ogretmen ya da sahip/yonetici.',
        params: kaynakParam,
        body: KaynakGuncelleGirdiSema,
        response: { 200: KaynakDetaySema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      // Url dogrulama ve parola sifreleme veritabanindan once (hatali istek islem acmaz).
      const url = g.url === undefined ? null : kaynakUrlCoz(g.url);
      const parolaSifreli =
        g.parola === undefined ? undefined : g.parola === null ? null : parolaSifrele(g.parola);
      const yeniBitis =
        g.gecerlilik_bitis_at === undefined
          ? undefined
          : g.gecerlilik_bitis_at === null
            ? null
            : gelecekTarih(g.gecerlilik_bitis_at);
      return withTenant(db, kiraci(y), async (tx) => {
        const { k, d } = await personelKaynagiBul(tx, y, request.params.id, true);
        await kayitModuluAcikOlmali(tx, y, k.grup_id);

        const yeniGorunurluk =
          g.gorunurluk ?? (k.gorunurluk as 'ogretmen' | 'grup' | 'secili_ogrenciler');
        if (g.ogrenci_idleri !== undefined && yeniGorunurluk !== 'secili_ogrenciler') {
          throw new AppError(
            422,
            errorCodes.validation,
            '`ogrenci_idleri` yalnızca `secili_ogrenciler` görünürlüğünde verilir.',
          );
        }
        let alicilar: string[] | null = null; // null: alici listesi degismez
        if (yeniGorunurluk === 'secili_ogrenciler') {
          if (g.ogrenci_idleri !== undefined) {
            if (g.ogrenci_idleri.length === 0) {
              throw new AppError(
                422,
                kaynakHataKodlari.aliciGecersiz,
                '`secili_ogrenciler` için en az bir öğrenci seçilmeli.',
              );
            }
            alicilar = await alicilariDogrula(tx, {
              dersId: k.ders_id,
              grupId: k.grup_id,
              ogrenciIdleri: g.ogrenci_idleri,
            });
          } else if (k.gorunurluk !== 'secili_ogrenciler') {
            throw new AppError(
              422,
              kaynakHataKodlari.aliciGecersiz,
              '`secili_ogrenciler` için `ogrenci_idleri` verilmeli.',
            );
          }
        } else if (k.gorunurluk === 'secili_ogrenciler') {
          alicilar = [];
        }

        // Durum gecisi.
        let durum = k.durum;
        if (g.durum !== undefined) durum = g.durum;
        else if (k.durum === 'bozuk') durum = 'aktif';
        else if (k.durum === 'suresi_doldu' && yeniBitis !== undefined) durum = 'aktif';
        const etkinBitis = yeniBitis === undefined ? k.gecerlilik_bitis_at : yeniBitis;
        if (durum === 'aktif' && etkinBitis !== null && etkinBitis.getTime() <= Date.now()) {
          throw new AppError(
            422,
            kaynakHataKodlari.suresiGecmis,
            'Son erişim tarihi geçmiş; kaynağı açmak için yeni bir tarih verin.',
            { alan: 'gecerlilik_bitis_at' },
          );
        }

        const [guncel] = await tx
          .update(dersKaynaklari)
          .set({
            ...(g.baslik === undefined ? {} : { baslik: g.baslik }),
            ...(url ? { url: url.url, saglayici: url.saglayici } : {}),
            ...(parolaSifreli === undefined ? {} : { parola_sifreli: parolaSifreli }),
            ...(yeniBitis === undefined ? {} : { gecerlilik_bitis_at: yeniBitis }),
            ...(g.konu_id === undefined ? {} : { konu_id: g.konu_id }),
            ...(g.gorunurluk === undefined ? {} : { gorunurluk: g.gorunurluk }),
            durum,
          })
          .where(eq(dersKaynaklari.id, k.id))
          .returning();
        if (!guncel) throw new Error('kaynak güncellenemedi');

        if (alicilar !== null) {
          await tx.delete(dersKaynagiAlicilari).where(eq(dersKaynagiAlicilari.kaynak_id, k.id));
          await alicilariYaz(tx, y, k.id, alicilar);
        }
        if (k.durum === 'bozuk' && durum === 'aktif') {
          await tx
            .update(dersKaynagiSorunlari)
            .set({ durum: 'cozuldu', cozen_id: y.uyelikId, cozuldu_at: sql`now()` })
            .where(
              and(eq(dersKaynagiSorunlari.kaynak_id, k.id), eq(dersKaynagiSorunlari.durum, 'acik')),
            );
        }
        await dersDenetimiYaz(
          tx,
          y,
          request.ip,
          durum === 'gizli' && k.durum !== 'gizli' ? 'kaynak.gizle' : 'kaynak.guncelle',
          'ders_kaynagi',
          k.id,
          { durum: k.durum, gorunurluk: k.gorunurluk },
          {
            alanlar: Object.keys(g).filter((a) => g[a as keyof typeof g] !== undefined),
            durum,
            gorunurluk: guncel.gorunurluk,
          },
        );
        return detayYaniti(tx, guncel, d);
      });
    },
  );

  app.delete(
    '/kurumlar/:kurum_id/kaynaklar/:id',
    {
      ...yaz,
      schema: {
        tags: ['ders'],
        summary:
          'Kaynagi yumusak sil (`silindi_at`). Ogrenciye hemen gorunmez olur; kayit korunur (izleme ve bildirimler).',
        params: kaynakParam,
        response: { 200: KaynakSilYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const { k } = await personelKaynagiBul(tx, y, request.params.id, true);
        await kayitModuluAcikOlmali(tx, y, k.grup_id);
        await tx
          .update(dersKaynaklari)
          .set({ silindi_at: sql`now()` })
          .where(eq(dersKaynaklari.id, k.id));
        await dersDenetimiYaz(tx, y, request.ip, 'kaynak.sil', 'ders_kaynagi', k.id, null, {
          tur: k.tur,
          grup_id: k.grup_id,
        });
        return { id: k.id, silindi: true as const };
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/kaynaklar/:id/sorunlar/coz',
    {
      ...yaz,
      schema: {
        tags: ['ders'],
        summary:
          'Kaynagin tum acik "acilmiyor" bildirimlerini coz; `bozuk` kaynak `aktif`e doner. Acik bildirim yoksa `cozulen_sayisi: 0`.',
        params: kaynakParam,
        response: { 200: KaynakSorunCozYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const { k } = await personelKaynagiBul(tx, y, request.params.id, true);
        await kayitModuluAcikOlmali(tx, y, k.grup_id);
        const cozulen = await tx
          .update(dersKaynagiSorunlari)
          .set({ durum: 'cozuldu', cozen_id: y.uyelikId, cozuldu_at: sql`now()` })
          .where(
            and(eq(dersKaynagiSorunlari.kaynak_id, k.id), eq(dersKaynagiSorunlari.durum, 'acik')),
          )
          .returning({ id: dersKaynagiSorunlari.id });
        let durum = k.durum;
        if (k.durum === 'bozuk') {
          await tx
            .update(dersKaynaklari)
            .set({ durum: 'aktif' })
            .where(eq(dersKaynaklari.id, k.id));
          durum = 'aktif';
        }
        if (cozulen.length > 0) {
          await dersDenetimiYaz(tx, y, request.ip, 'kaynak.sorun_coz', 'ders_kaynagi', k.id, null, {
            cozulen_sayisi: cozulen.length,
          });
        }
        return {
          cozulen_sayisi: cozulen.length,
          kaynak_durumu: durum as 'aktif' | 'suresi_doldu' | 'bozuk' | 'gizli',
        };
      });
    },
  );

  return Promise.resolve();
};
