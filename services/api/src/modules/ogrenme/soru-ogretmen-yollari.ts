import {
  SoruCevapGirdiSema,
  SoruCevapladiklarimSorguSema,
  SoruDetaySema,
  SoruKuyrukSayiYanitSema,
  SoruKuyrukSorguSema,
  SoruListeYanitSema,
  SoruMusaitlikGirdiSema,
  SoruMusaitlikSema,
  errorCodes,
  soruHataKodlari,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { and, eq, exists, inArray, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import {
  soruMasasiUyeleri,
  soruMesajlari,
  soruOgretmenDurumlari,
  sorular,
} from '../../db/schema.js';
import { requirePermission, type YetkiBaglami } from '../hesap/index.js';
import { detayHam, detayYaniti, hamDosyaIdleri } from './soru-detay.js';
import { soruAramaKosulu, soruListele } from './soru-liste.js';
import {
  PERSONEL_EK_TURLERI,
  ekleriHazirla,
  ekleriYaz,
  okumaAdresleriAl,
  sorununFotografKumesi,
} from './soru-medya.js';
import { mesajEkle, mesajEklendiOlayiYaz, oncekiMesaj } from './soru-mesaj.js';
import {
  ayarOku,
  benzersizlikIhlali,
  istekKilidi,
  kiraci,
  kurumParam,
  olayBaglami,
  soruBulunamadi,
  soruModuluAcikOlmali,
  soruParam,
  yerelZaman,
  yetkiAl,
  yonetimYetkisi,
} from './soru-ortak.js';
import { kuyrukKosulu } from './soru-yonlendirme.js';

const personelOlmali = (y: YetkiBaglami) => {
  if (y.rol === 'ogrenci' || y.rol === 'veli') {
    throw new AppError(403, errorCodes.izinYok, 'Bu uç yalnızca öğretmenlere açıktır.');
  }
};

/** Ogretmen uclari: cevap kuyrugu, cevap, arsiv, musaitlik. */
export const soruOgretmenYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const kapi = () => requirePermission('soru.cevapla', { scope: 'grup' });

  app.get(
    '/kurumlar/:kurum_id/gelen-sorular',
    {
      preHandler: kapi(),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Cevap bekleyen sorular (varsayilan `acik` + `takip_bekliyor`): kendisine atananlar, uyesi oldugu masalardakiler (masada baskasi ustlendiyse hayir); sahip/yonetici icin yonetici kuyrugu da. En eski once; brans ve ogrenci suzgeci; imleçli.',
        params: kurumParam,
        querystring: SoruKuyrukSorguSema,
        response: { 200: SoruListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      personelOlmali(y);
      const s = request.query;
      return withTenant(db, kiraci(y), (tx) =>
        soruListele(
          tx,
          [
            eq(sorular.kurum_id, y.kurumId),
            kuyrukKosulu(tx, y),
            s.durum
              ? eq(sorular.durum, s.durum)
              : inArray(sorular.durum, ['acik', 'takip_bekliyor']),
            s.brans_kodu ? eq(sorular.brans_kodu, s.brans_kodu) : undefined,
            s.ogrenci_id ? eq(sorular.ogrenci_id, s.ogrenci_id) : undefined,
          ],
          { artan: true, limit: s.limit, imlec: s.imlec },
        ),
      );
    },
  );

  app.get(
    '/kurumlar/:kurum_id/gelen-sorular/sayi',
    {
      preHandler: kapi(),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Cevap bekleyen soru sayisi (toplam ve brans kirilimi) ve en eski bekleyenin zamani.',
        params: kurumParam,
        response: { 200: SoruKuyrukSayiYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      personelOlmali(y);
      return withTenant(db, kiraci(y), async (tx) => {
        const satirlar = await tx
          .select({
            brans_kodu: sorular.brans_kodu,
            n: sql<number>`count(*)::int`,
            en_eski: sql<string | null>`min(${sorular.son_hareket_at})::text`,
          })
          .from(sorular)
          .where(
            and(
              eq(sorular.kurum_id, y.kurumId),
              kuyrukKosulu(tx, y),
              inArray(sorular.durum, ['acik', 'takip_bekliyor']),
            ),
          )
          .groupBy(sorular.brans_kodu)
          .orderBy(sorular.brans_kodu);
        const enEski = satirlar
          .map((r) => r.en_eski)
          .filter((t): t is string => t !== null)
          .map((t) => new Date(t))
          .sort((a, b) => a.getTime() - b.getTime())[0];
        return {
          bekleyen: satirlar.reduce((t, r) => t + r.n, 0),
          branslar: satirlar.map((r) => ({ brans_kodu: r.brans_kodu, bekleyen: r.n })),
          en_eski_at: enEski?.toISOString() ?? null,
        };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/cevapladigim-sorular',
    {
      preHandler: kapi(),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Cevapladigim sorularin arsivi (bir cevap mesaji yazdigim sorular), en yeni hareket once; brans/ogrenci suzgeci ve Turkce harf duyarsiz arama.',
        params: kurumParam,
        querystring: SoruCevapladiklarimSorguSema,
        response: { 200: SoruListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      personelOlmali(y);
      const s = request.query;
      return withTenant(db, kiraci(y), (tx) =>
        soruListele(
          tx,
          [
            eq(sorular.kurum_id, y.kurumId),
            exists(
              tx
                .select({ x: sql`1` })
                .from(soruMesajlari)
                .where(
                  and(
                    eq(soruMesajlari.soru_id, sorular.id),
                    eq(soruMesajlari.tur, 'cevap'),
                    eq(soruMesajlari.yazar_id, y.uyelikId),
                  ),
                ),
            ),
            s.brans_kodu ? eq(sorular.brans_kodu, s.brans_kodu) : undefined,
            s.ogrenci_id ? eq(sorular.ogrenci_id, s.ogrenci_id) : undefined,
            s.q ? soruAramaKosulu(s.q) : undefined,
          ],
          { artan: false, limit: s.limit, imlec: s.imlec },
        ),
      );
    },
  );

  app.post(
    '/kurumlar/:kurum_id/sorular/:id/cevap',
    {
      preHandler: kapi(),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Soruyu cevapla: metin ve/veya ekler (fotograf, cizimli fotograf, ses <= 180 sn; en cok 4) ya da "derste konusalim". `acik`/`takip_bekliyor` -> `cevaplandi`. Masada ilk cevaplayan `ustlenen_id` olur; sonra cevaplayan masa uyesi 409 `masa_ustlenildi` (sahip/yonetici haric). Hedefi olmayan ogretmene soru 404.',
        params: soruParam,
        body: SoruCevapGirdiSema,
        response: { 200: SoruDetaySema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      personelOlmali(y);
      const g = request.body;
      const baglam = olayBaglami(y, request.correlationId);
      const ekGirdi = g.ekler ?? [];
      if (!g.metin && ekGirdi.length === 0 && !g.derste_konusalim) {
        throw new AppError(
          422,
          soruHataKodlari.cevapBos,
          'Cevap için metin, ek ya da "derste konuşalım" gerekli.',
        );
      }

      const calistir = () =>
        withTenant(db, kiraci(y), async (tx: Tx) => {
          const [s] = await tx
            .select()
            .from(sorular)
            .where(and(eq(sorular.id, request.params.id), eq(sorular.kurum_id, y.kurumId)))
            .for('update');
          if (!s) throw soruBulunamadi();
          const yonetim = yonetimYetkisi(y);
          const atanan = s.atanan_ogretmen_id === y.uyelikId;
          let masaUyesi = false;
          if (s.masa_id) {
            const [u] = await tx
              .select({ id: soruMasasiUyeleri.id })
              .from(soruMasasiUyeleri)
              .where(
                and(
                  eq(soruMasasiUyeleri.masa_id, s.masa_id),
                  eq(soruMasasiUyeleri.ogretmen_id, y.uyelikId),
                ),
              );
            masaUyesi = u !== undefined;
          }
          const hedefMi = atanan || masaUyesi || s.ustlenen_id === y.uyelikId;
          if (!hedefMi && !yonetim) throw soruBulunamadi();

          const ayar = await ayarOku(tx, y.kurumId);
          await istekKilidi(tx, y.kurumId, g.istek_id);
          const onceki = await oncekiMesaj(tx, y, g.istek_id);
          if (onceki) {
            if (onceki.soru_id !== s.id) {
              throw new AppError(
                409,
                soruHataKodlari.istekCakismasi,
                'İstek kimliği başka bir kayıtta kullanılmış.',
              );
            }
            return { ham: await detayHam(tx, s), takip: ayar.takip };
          }
          await soruModuluAcikOlmali(tx, y.kurumId, s.ogrenci_id);

          // Masa: ilk cevaplayan ustlenir; baskasi ustlendiyse (yonetim haric) 409.
          if (
            s.yonlendirme === 'masa' &&
            s.ustlenen_id &&
            s.ustlenen_id !== y.uyelikId &&
            !yonetim
          ) {
            throw new AppError(
              409,
              soruHataKodlari.masaUstlenildi,
              'Bu soruyu başka bir öğretmen üstlendi.',
            );
          }
          if (s.durum !== 'acik' && s.durum !== 'takip_bekliyor') {
            throw new AppError(
              409,
              soruHataKodlari.soruDurumuGecersiz,
              'Bu soru şu an cevaplanamaz.',
            );
          }

          const mevcut = await detayHam(tx, s);
          const kaynak = await sorununFotografKumesi(
            tx,
            s.id,
            mevcut.mesajlar.map((m) => m.m.id),
          );
          const { hazir } = await ekleriHazirla(tx, y, ayar, ekGirdi, PERSONEL_EK_TURLERI, kaynak);
          const mesajId = await mesajEkle(tx, y, s.id, {
            yazarRolu: hedefMi ? 'ogretmen' : 'yonetici',
            tur: 'cevap',
            metin: g.metin ?? null,
            derste: g.derste_konusalim,
            istekId: g.istek_id,
          });
          await ekleriYaz(tx, y, baglam, mesajId, hazir);
          const ustlen = s.yonlendirme === 'masa' && s.ustlenen_id === null && masaUyesi;
          const [yeni] = await tx
            .update(sorular)
            .set({
              durum: 'cevaplandi',
              son_hareket_at: new Date(),
              ...(s.ilk_cevap_at
                ? {}
                : { ilk_cevap_at: new Date(), ilk_cevaplayan_id: y.uyelikId }),
              ...(ustlen ? { ustlenen_id: y.uyelikId } : {}),
            })
            .where(eq(sorular.id, s.id))
            .returning();
          if (!yeni) throw new Error('soru güncellenemedi');
          await mesajEklendiOlayiYaz(tx, baglam, yeni, mesajId, 'cevap', y.uyelikId, [
            yeni.ogrenci_id,
          ]);
          return { ham: await detayHam(tx, yeni), takip: ayar.takip };
        });

      let sonuc: Awaited<ReturnType<typeof calistir>>;
      try {
        sonuc = await calistir();
      } catch (err) {
        if (g.istek_id && benzersizlikIhlali(err, 'soru_mesajlari_kurum_id_istek_id_uniq')) {
          sonuc = await calistir();
        } else {
          throw err;
        }
      }
      const { adresler, alinamadi } = await okumaAdresleriAl(
        app,
        y.kurumId,
        hamDosyaIdleri(sonuc.ham),
      );
      return detayYaniti(sonuc.ham, adresler, alinamadi, sonuc.takip);
    },
  );

  const musaitlik = async (tx: Tx, y: YetkiBaglami) => {
    const z = await yerelZaman(tx, y.kurumId);
    const [d] = await tx
      .select()
      .from(soruOgretmenDurumlari)
      .where(
        and(
          eq(soruOgretmenDurumlari.kurum_id, y.kurumId),
          eq(soruOgretmenDurumlari.ogretmen_id, y.uyelikId),
        ),
      );
    const bugunDegil = d?.musait_degil_tarihi === z.gun;
    return { musait: !bugunDegil, musait_degil_tarihi: bugunDegil ? z.gun : null };
  };

  app.get(
    '/kurumlar/:kurum_id/soru-musaitligim',
    {
      preHandler: kapi(),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogretmenin "musait / bugun cevap veremiyorum" durumu (kurum yerel gunu icin gecerli).',
        params: kurumParam,
        response: { 200: SoruMusaitlikSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      personelOlmali(y);
      return withTenant(db, kiraci(y), (tx) => musaitlik(tx, y));
    },
  );

  app.put(
    '/kurumlar/:kurum_id/soru-musaitligim',
    {
      preHandler: kapi(),
      schema: {
        tags: ['ogrenme'],
        summary:
          '`musait: false`: bugun (kurum yerel gunu) cevap veremiyorum; ogrencinin tahmini cevap yanitinda `hedef_musait: false` gorunur. Gun gecince kendiliginden gecersiz olur.',
        params: kurumParam,
        body: SoruMusaitlikGirdiSema,
        response: { 200: SoruMusaitlikSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      personelOlmali(y);
      return withTenant(db, kiraci(y), async (tx) => {
        const z = await yerelZaman(tx, y.kurumId);
        const tarih = request.body.musait ? null : z.gun;
        await tx
          .insert(soruOgretmenDurumlari)
          .values({
            id: uuidv7(),
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            ogretmen_id: y.uyelikId,
            musait_degil_tarihi: tarih,
          })
          .onConflictDoUpdate({
            target: [soruOgretmenDurumlari.kurum_id, soruOgretmenDurumlari.ogretmen_id],
            set: { musait_degil_tarihi: tarih },
          });
        return musaitlik(tx, y);
      });
    },
  );

  return Promise.resolve();
};
