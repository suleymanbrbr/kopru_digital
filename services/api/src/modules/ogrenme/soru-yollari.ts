import {
  SoruBildirimGirdiSema,
  SoruBildirimSema,
  SoruDetaySema,
  SoruKotaSema,
  SoruListeSorguSema,
  SoruListeYanitSema,
  SoruOlusturGirdiSema,
  SoruOlusturYanitSema,
  SoruTakipGirdiSema,
  errorCodes,
  ogrenmeSoruSorildiV1,
  soruHataKodlari,
  type SoruEkGirdi,
} from '@kopru/contracts';
import { AppError, publishInTx, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { uuidv7 } from 'uuidv7';

import {
  bransler,
  konular,
  soruBildirimleri,
  soruDosyalari,
  soruMesajlari,
  sorular,
} from '../../db/schema.js';
import { gorunenAdlar, requirePermission } from '../hesap/index.js';
import {
  detayHam,
  detayYaniti,
  gorunurSoruBul,
  hamDosyaIdleri,
  type DetayHam,
} from './soru-detay.js';
import { soruListele, soruAramaKosulu } from './soru-liste.js';
import {
  baglandiOlayiYaz,
  OGRENCI_EK_TURLERI,
  ekleriHazirla,
  ekleriYaz,
  okumaAdresleriAl,
  sorununFotografKumesi,
} from './soru-medya.js';
import {
  mesajEkle,
  mesajEklendiOlayiYaz,
  oncekiMesaj,
  soruCoz,
  yenidenAcildiOlayiYaz,
} from './soru-mesaj.js';
import {
  OUTBOX_TABLOSU,
  ayarOku,
  benzersizlikIhlali,
  herhangiBirIzin,
  istekKilidi,
  kiraci,
  kotaDurumu,
  kotaTuket,
  kurumParam,
  olayBaglami,
  soruModuluAcikOlmali,
  soruParam,
  yerelZaman,
  yetkiAl,
} from './soru-ortak.js';
import {
  aliciOgretmenIdleri,
  hedefOgretmenIdleri,
  tahminiCevap,
  yonlendirmeBul,
} from './soru-yonlendirme.js';

const ogrenciOlmali = (rol: string) => {
  if (rol !== 'ogrenci') {
    throw new AppError(403, errorCodes.izinYok, 'Bu uç yalnızca öğrencilere açıktır.');
  }
};

/** Soru olusturma ve ogrenci tarafi uclari (ogrenci: soru, arsiv, kota, anladim, takip; herkes: detay, bildirim). */
export const soruYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;

  async function detayCevabi(
    a: FastifyInstance,
    kurumId: string,
    ham: DetayHam,
    takipLimiti: number,
  ) {
    const { adresler, alinamadi } = await okumaAdresleriAl(a, kurumId, hamDosyaIdleri(ham));
    return detayYaniti(ham, adresler, alinamadi, takipLimiti);
  }

  app.post(
    '/kurumlar/:kurum_id/sorular',
    {
      preHandler: requirePermission('soru.sor', { scope: 'kendi' }),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Soru sor (yalniz ogrenci). Once medya servisine yukleyin; dosyalar `hazir` olunca cagirin (kopya yoksa/hazir degilse 409 `dosya_hazir_degil`, istemci yeniden dener). Brans/konu dogrulanir, yonlendirme (atanan ogretmen > masa > yonetici) ve gunluk/aylik kota (429 `kota_asildi`) ayni islemde. `istek_id` ayni ise onceki sonuc doner (200, `tekrar: true`, kota harcanmaz).',
        params: kurumParam,
        body: SoruOlusturGirdiSema,
        response: { 200: SoruOlusturYanitSema, 201: SoruOlusturYanitSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y.rol);
      const g = request.body;
      const baglam = olayBaglami(y, request.correlationId);

      const calistir = (): Promise<{
        ham: DetayHam;
        takip: number;
        tekrar: boolean;
        kota: ReturnType<typeof SoruKotaSema.parse>;
        tahmin: Awaited<ReturnType<typeof tahminiCevap>>;
      }> =>
        withTenant(db, kiraci(y), async (tx) => {
          const ayar = await ayarOku(tx, y.kurumId);
          const zaman = await yerelZaman(tx, y.kurumId);
          const kayitli = async (soruId: string) => {
            const [s] = await tx.select().from(sorular).where(eq(sorular.id, soruId));
            if (!s) throw new Error('soru okunamadı');
            return {
              ham: await detayHam(tx, s),
              takip: ayar.takip,
              tekrar: true,
              kota: await kotaDurumu(tx, y.kurumId, y.uyelikId, ayar, zaman),
              tahmin: await tahminiCevap(tx, y.kurumId, s),
            };
          };

          await istekKilidi(tx, y.kurumId, g.istek_id);
          if (g.istek_id) {
            const [var_] = await tx
              .select()
              .from(sorular)
              .where(and(eq(sorular.kurum_id, y.kurumId), eq(sorular.istek_id, g.istek_id)));
            if (var_) {
              if (var_.ogrenci_id !== y.uyelikId) {
                throw new AppError(
                  409,
                  soruHataKodlari.istekCakismasi,
                  'İstek kimliği başka bir kayıtta kullanılmış.',
                );
              }
              return kayitli(var_.id);
            }
          }

          await soruModuluAcikOlmali(tx, y.kurumId, y.uyelikId);

          const [brans] = await tx
            .select({ kod: bransler.kod })
            .from(bransler)
            .where(and(eq(bransler.kod, g.brans_kodu), eq(bransler.aktif, true)));
          if (!brans) {
            throw new AppError(422, soruHataKodlari.bransGecersiz, 'Branş kodu geçersiz.');
          }
          if (g.konu_id) {
            const [k] = await tx
              .select({ id: konular.id, brans: konular.brans_kodu, kurum: konular.kurum_id })
              .from(konular)
              .where(eq(konular.id, g.konu_id));
            if (k?.brans !== g.brans_kodu || (k.kurum !== null && k.kurum !== y.kurumId)) {
              throw new AppError(
                422,
                soruHataKodlari.konuGecersiz,
                'Konu bulunamadı ya da branşa ait değil.',
              );
            }
          }
          const hedef = await yonlendirmeBul(tx, y.kurumId, y.uyelikId, g.brans_kodu);

          const isaretler = g.isaretler ?? [];
          const fotoKumesi = new Set(g.fotograflar);
          const isaretEkleri: SoruEkGirdi[] = isaretler.map((i) => ({
            tur: 'cizimli_fotograf',
            medya_dosya_id: i.medya_dosya_id,
            kaynak_dosya_id: i.kaynak_dosya_id,
            ...(i.cizim_verisi === undefined ? {} : { cizim_verisi: i.cizim_verisi }),
          }));
          // Kota: sorunun kendisiyle ayni islemde (hata olursa hak geri doner).
          const kota = await kotaTuket(tx, y.kurumId, y.uyelikId, ayar, zaman);
          const { hazir } = await ekleriHazirla(
            tx,
            y,
            ayar,
            isaretEkleri,
            OGRENCI_EK_TURLERI,
            fotoKumesi,
            g.fotograflar.map((id) => ({ id, tur: OGRENCI_EK_TURLERI.fotograf })),
          );

          const soruId = uuidv7();
          await tx.insert(sorular).values({
            id: soruId,
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            ogrenci_id: y.uyelikId,
            brans_kodu: g.brans_kodu,
            konu_id: g.konu_id ?? null,
            baslik: g.baslik ?? null,
            yonlendirme: hedef.yonlendirme,
            atanan_ogretmen_id: hedef.atanan_ogretmen_id,
            masa_id: hedef.masa_id,
            kota_donemi: zaman.ay,
            istek_id: g.istek_id ?? null,
          });
          let sira = 0;
          for (const dosyaId of g.fotograflar) {
            await tx.insert(soruDosyalari).values({
              id: uuidv7(),
              kurum_id: y.kurumId,
              created_by: y.kullaniciId,
              soru_id: soruId,
              medya_dosya_id: dosyaId,
              sira: sira++,
            });
            await baglandiOlayiYaz(tx, baglam, dosyaId, 'soru', soruId);
          }
          const mesajId = await mesajEkle(tx, y, soruId, {
            yazarRolu: 'ogrenci',
            tur: 'soru',
            metin: g.metin ?? null,
            derste: false,
            istekId: undefined,
          });
          await ekleriYaz(tx, y, baglam, mesajId, hazir);

          const hedefler = await hedefOgretmenIdleri(tx, y.kurumId, hedef);
          await publishInTx(
            tx,
            ogrenmeSoruSorildiV1.create({
              ...baglam,
              data: {
                soru_id: soruId,
                ogrenci_id: y.uyelikId,
                brans_kodu: g.brans_kodu,
                yonlendirme: hedef.yonlendirme,
                atanan_ogretmen_id: hedef.atanan_ogretmen_id,
                masa_id: hedef.masa_id,
                hedef_ogretmen_idleri: hedefler,
              },
            }),
            { table: OUTBOX_TABLOSU },
          );
          const [s] = await tx.select().from(sorular).where(eq(sorular.id, soruId));
          if (!s) throw new Error('soru yazılamadı');
          return {
            ham: await detayHam(tx, s),
            takip: ayar.takip,
            tekrar: false,
            kota,
            tahmin: await tahminiCevap(tx, y.kurumId, hedef),
          };
        });

      let sonuc: Awaited<ReturnType<typeof calistir>>;
      try {
        sonuc = await calistir();
      } catch (err) {
        // Ayni istek_id ile eszamanli iki istek: kaybeden onceki sonucu okur.
        if (g.istek_id && benzersizlikIhlali(err, 'sorular_kurum_id_istek_id_uniq')) {
          sonuc = await calistir();
        } else {
          throw err;
        }
      }
      const yanit = await detayCevabi(app, y.kurumId, sonuc.ham, sonuc.takip);
      void reply.status(sonuc.tekrar ? 200 : 201);
      return { ...yanit, tekrar: sonuc.tekrar, kota: sonuc.kota, tahmini_cevap: sonuc.tahmin };
    },
  );

  app.get(
    '/kurumlar/:kurum_id/sorularim',
    {
      preHandler: requirePermission('soru.sor', { scope: 'kendi' }),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrencinin kendi soru arsivi: brans, konu, durum suzgeci ve Turkce harf duyarsiz metin aramasi (baslik ve mesajlar); en yeni hareket once, imecli.',
        params: kurumParam,
        querystring: SoruListeSorguSema,
        response: { 200: SoruListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y.rol);
      const s = request.query;
      return withTenant(db, kiraci(y), (tx) =>
        soruListele(
          tx,
          [
            eq(sorular.kurum_id, y.kurumId),
            eq(sorular.ogrenci_id, y.uyelikId),
            s.brans_kodu ? eq(sorular.brans_kodu, s.brans_kodu) : undefined,
            s.konu_id ? eq(sorular.konu_id, s.konu_id) : undefined,
            s.durum ? eq(sorular.durum, s.durum) : undefined,
            s.q ? soruAramaKosulu(s.q) : undefined,
          ],
          { artan: false, limit: s.limit, imlec: s.imlec },
        ),
      );
    },
  );

  app.get(
    '/kurumlar/:kurum_id/soru-kotam',
    {
      preHandler: requirePermission('soru.sor', { scope: 'kendi' }),
      schema: {
        tags: ['ogrenme'],
        summary: 'Kalan soru hakki (gunluk/aylik) ve sifirlanma zamanlari.',
        params: kurumParam,
        response: { 200: SoruKotaSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y.rol);
      return withTenant(db, kiraci(y), async (tx) =>
        kotaDurumu(
          tx,
          y.kurumId,
          y.uyelikId,
          await ayarOku(tx, y.kurumId),
          await yerelZaman(tx, y.kurumId),
        ),
      );
    },
  );

  app.get(
    '/kurumlar/:kurum_id/sorular/:id',
    {
      preHandler: herhangiBirIzin('soru.sor', 'soru.cevapla', 'soru.yonet'),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Soru detayi (ileti dizisi, ekler, okuma adresleri 10 dk gecerli). Ogrenci yalniz kendi sorusunu; ogretmen kendisine yonlenen/ustlendigi/masasindaki sorulari; `soru.yonet` kurumdaki hepsini gorur, digerleri 404. Medya yanit vermezse soru yine doner (`adres_alinamadi: true`).',
        params: soruParam,
        response: { 200: SoruDetaySema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { ham, takip } = await withTenant(db, kiraci(y), async (tx) => {
        const s = await gorunurSoruBul(tx, y, request.params.id);
        const ayar = await ayarOku(tx, y.kurumId);
        return { ham: await detayHam(tx, s), takip: ayar.takip };
      });
      return detayCevabi(app, y.kurumId, ham, takip);
    },
  );

  app.post(
    '/kurumlar/:kurum_id/sorular/:id/anladim',
    {
      preHandler: requirePermission('soru.sor', { scope: 'kendi' }),
      schema: {
        tags: ['ogrenme'],
        summary:
          '"Anladim": cevaplanmis soru `cozuldu` olur; `ogrenme.soru.cozuldu.v1` (dosya_idleri, silinecek_at = simdi + foto_saklama_gun). Zaten cozulduyse etkisiz (olay yok). Hic cevaplanmamissa 409 `soru_durumu_gecersiz`.',
        params: soruParam,
        response: { 200: SoruDetaySema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y.rol);
      const baglam = olayBaglami(y, request.correlationId);
      const { ham, takip } = await withTenant(db, kiraci(y), async (tx) => {
        const s = await gorunurSoruBul(tx, y, request.params.id, true);
        await soruModuluAcikOlmali(tx, y.kurumId, y.uyelikId);
        const ayar = await ayarOku(tx, y.kurumId);
        if (s.durum !== 'cozuldu') {
          if (s.durum !== 'cevaplandi' && s.durum !== 'takip_bekliyor') {
            throw new AppError(409, soruHataKodlari.soruDurumuGecersiz, 'Soru henüz cevaplanmadı.');
          }
          await soruCoz(tx, baglam, s.id, 'ogrenci', ayar.saklamaGun);
        }
        const [yeni] = await tx.select().from(sorular).where(eq(sorular.id, s.id));
        if (!yeni) throw new Error('soru okunamadı');
        return { ham: await detayHam(tx, yeni), takip: ayar.takip };
      });
      return detayCevabi(app, y.kurumId, ham, takip);
    },
  );

  app.post(
    '/kurumlar/:kurum_id/sorular/:id/takip',
    {
      preHandler: requirePermission('soru.sor', { scope: 'kendi' }),
      schema: {
        tags: ['ogrenme'],
        summary:
          '"Hala anlamadim" + takip sorusu: `cevaplandi` -> `takip_bekliyor`. `cozuldu` soru yeniden acilir (`ogrenme.soru.yeniden_acildi.v1`, fotograf silinme zamani temizlenir). Takip kotaya girmez; `soru_basina_takip_limiti` asilirsa 422 `takip_limiti_asildi`. `istek_id` ile tekrarlanabilir.',
        params: soruParam,
        body: SoruTakipGirdiSema,
        response: { 200: SoruDetaySema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y.rol);
      const g = request.body;
      const baglam = olayBaglami(y, request.correlationId);
      const calistir = () =>
        withTenant(db, kiraci(y), async (tx) => {
          const s = await gorunurSoruBul(tx, y, request.params.id, true);
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
          await soruModuluAcikOlmali(tx, y.kurumId, y.uyelikId);
          if (s.durum !== 'cevaplandi' && s.durum !== 'cozuldu') {
            throw new AppError(
              409,
              soruHataKodlari.soruDurumuGecersiz,
              'Takip sorusu yalnızca cevaplanmış ya da çözülmüş soruya sorulur.',
            );
          }
          const mevcut = await detayHam(tx, s);
          if (mevcut.takipSayisi >= ayar.takip) {
            throw new AppError(
              422,
              soruHataKodlari.takipLimitiAsildi,
              'Bu soru için takip sorusu hakkınız doldu.',
            );
          }
          const kaynak = await sorununFotografKumesi(
            tx,
            s.id,
            mevcut.mesajlar.map((m) => m.m.id),
          );
          const ekGirdi: SoruEkGirdi[] = g.ekler ?? [];
          const { hazir } = await ekleriHazirla(tx, y, ayar, ekGirdi, OGRENCI_EK_TURLERI, kaynak);
          const mesajId = await mesajEkle(tx, y, s.id, {
            yazarRolu: 'ogrenci',
            tur: 'takip',
            metin: g.metin,
            derste: false,
            istekId: g.istek_id,
          });
          await ekleriYaz(tx, y, baglam, mesajId, hazir);
          const yenidenAcildi = s.durum === 'cozuldu';
          const [yeni] = await tx
            .update(sorular)
            .set({
              durum: 'takip_bekliyor',
              son_hareket_at: new Date(),
              cozuldu_at: null,
              cozuldu_kaynagi: null,
              foto_silinme_at: null,
              ...(yenidenAcildi ? { yeniden_acilma_sayisi: s.yeniden_acilma_sayisi + 1 } : {}),
            })
            .where(eq(sorular.id, s.id))
            .returning();
          if (!yeni) throw new Error('soru güncellenemedi');
          if (yenidenAcildi) await yenidenAcildiOlayiYaz(tx, baglam, yeni);
          await mesajEklendiOlayiYaz(
            tx,
            baglam,
            yeni,
            mesajId,
            'takip',
            y.uyelikId,
            await aliciOgretmenIdleri(tx, y.kurumId, yeni),
          );
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
      return detayCevabi(app, y.kurumId, sonuc.ham, sonuc.takip);
    },
  );

  app.post(
    '/kurumlar/:kurum_id/sorular/:id/bildir',
    {
      preHandler: herhangiBirIzin('soru.sor', 'soru.cevapla', 'soru.yonet'),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Soruyu (ya da bir mesajini) uygunsuz icerik olarak bildir (ogrenci ve ogretmen). Ayni kisi ayni soru icin tek acik bildirim acar; tekrar cagri mevcut bildirimi dondurur. Gorunmeyen soru 404.',
        params: soruParam,
        body: SoruBildirimGirdiSema,
        response: { 200: SoruBildirimSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      return withTenant(db, kiraci(y), async (tx: Tx) => {
        const s = await gorunurSoruBul(tx, y, request.params.id);
        if (g.mesaj_id) {
          const [m] = await tx
            .select({ id: soruMesajlari.id })
            .from(soruMesajlari)
            .where(and(eq(soruMesajlari.id, g.mesaj_id), eq(soruMesajlari.soru_id, s.id)));
          if (!m) throw new AppError(422, errorCodes.validation, 'Mesaj bu soruya ait değil.');
        }
        await tx
          .insert(soruBildirimleri)
          .values({
            id: uuidv7(),
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            soru_id: s.id,
            mesaj_id: g.mesaj_id ?? null,
            bildiren_id: y.uyelikId,
            neden: g.neden,
            aciklama: g.aciklama ?? null,
          })
          .onConflictDoNothing();
        const [b] = await tx
          .select()
          .from(soruBildirimleri)
          .where(
            and(
              eq(soruBildirimleri.soru_id, s.id),
              eq(soruBildirimleri.bildiren_id, y.uyelikId),
              eq(soruBildirimleri.durum, 'acik'),
            ),
          );
        if (!b) throw new Error('bildirim yazılamadı');
        const adlar = await gorunenAdlar(tx, [y.uyelikId]);
        return {
          id: b.id,
          soru_id: b.soru_id,
          mesaj_id: b.mesaj_id,
          brans_kodu: s.brans_kodu,
          bildiren_id: b.bildiren_id,
          bildiren_adi: adlar.get(y.uyelikId) ?? null,
          neden: b.neden as 'uygunsuz',
          aciklama: b.aciklama,
          durum: 'acik' as const,
          created_at: b.created_at.toISOString(),
          kapandi_at: null,
          kapatma_notu: null,
        };
      });
    },
  );

  return Promise.resolve();
};
