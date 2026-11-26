import {
  DegerlendirmeGuncelleGirdiSema,
  DegerlendirmeHatirlatmaSema,
  DegerlendirmeListeSorguSema,
  DegerlendirmeListeYanitiSema,
  DegerlendirmeOlusturGirdiSema,
  DegerlendirmeSema,
  HATIRLATMA_EN_FAZLA,
  KaynakOnerisiListeSorguSema,
  KaynakOnerisiListeYanitiSema,
  KaynakOnerisiOlusturGirdiSema,
  KaynakOnerisiSema,
  OgrenciDegerlendirmeListeSorguSema,
  OgrenciDegerlendirmeListeYanitiSema,
  degerlendirmeHataKodlari,
  errorCodes,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin } from '@kopru/service-kit';
import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import {
  kaynakKitaplar,
  kaynakKitapTestleri,
  kaynakOnerileri,
  ogretmenDegerlendirmeleri,
} from '../../db/schema.js';
import { gorunenAdlar, kapsamdakiOgrenciler, requirePermission } from '../hesap/index.js';
import {
  degerlendirmeBul,
  degerlendirmeSayfasi,
  degerlendirmeYanitlari,
  degerlendirmeYayimlandiOlayiYaz,
  donemiDogrula,
  duzenlenebilirMi,
  oneriBul,
  oneriOlayiYaz,
  oneriYanitlari,
  ogrenciDegerlendirmeYanitlari,
  yonetimMi,
} from './degerlendirme-deposu.js';
import { bransVeKonuDogrula } from './gunluk-soru-deposu.js';
import {
  bransGecerliOlmali,
  imlecCoz,
  imlecYaz,
  kiraci,
  kurumParam,
  olayBaglami,
  yetkiAl,
} from './odev-deposu.js';
import { ogrenciBul, ogrenciOlmali, ogrenciParam, surumUyumluOlmali } from './plan-deposu.js';
import { haftaBaslangici, planBugunu, tarihEkle } from './plan-zaman.js';

const kayitParam = kurumParam.extend({ id: z.uuid() });

const izinYok = (mesaj: string) => new AppError(403, errorCodes.izinYok, mesaj);

/**
 * Ogretmen degerlendirmeleri ve onerilen kaynaklar: yazma/duzenleme/geri cekme, personel listeleri, ogrencinin
 * kendine gorunen listeleri ve haftalik hatirlatma. Kocluk gorunumu `kocluk-yollari.ts`'tedir.
 */
export const degerlendirmeYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const yaz = { preHandler: requirePermission('degerlendirme.yaz', { scope: 'grup' }) };
  const okuPersonel = { preHandler: requirePermission('degerlendirme.oku', { scope: 'grup' }) };
  const okuKendi = { preHandler: requirePermission('degerlendirme.oku', { scope: 'kendi' }) };
  const oneriYaz = { preHandler: requirePermission('kaynak_onerisi.yaz', { scope: 'grup' }) };
  const oneriOkuPersonel = {
    preHandler: requirePermission('kaynak_onerisi.oku', { scope: 'grup' }),
  };
  const oneriOkuKendi = { preHandler: requirePermission('kaynak_onerisi.oku', { scope: 'kendi' }) };

  // --- Degerlendirme: yaz / duzenle / geri cek ------------------------------------------------

  app.post(
    '/kurumlar/:kurum_id/ogrenciler/:ogrenci_id/degerlendirmeler',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrenci icin degerlendirme yaz (ogretmen: kendi ogrencileri, kapsam disi 404; sahip/yonetici: kurum). Donem: baslangic (bugunden sonra olamaz) ve istege bagli bitis (tek gun = bitis yok; en cok 31 gun; 422 `donem_gecersiz`); olcekler 1-5 ve hepsi istege bagli, yorum ya da en az bir olcek dolu olmali. `ogrenci_gorur` varsayilan false; true ise ogrenciye `ogrenme.degerlendirme.yayimlandi.v1` (uygulama ici bildirim, yorum olayda yok).',
        params: ogrenciParam,
        body: DegerlendirmeOlusturGirdiSema,
        response: { 201: DegerlendirmeSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      const baglam = olayBaglami(y, request.correlationId);
      const sonuc = await withTenant(db, kiraci(y), async (tx) => {
        await ogrenciBul(tx, y, request.params.ogrenci_id);
        donemiDogrula(g.donem_baslangic, g.donem_bitis ?? g.donem_baslangic);
        if (g.brans_kodu) await bransGecerliOlmali(tx, g.brans_kodu);
        const [d] = await tx
          .insert(ogretmenDegerlendirmeleri)
          .values({
            id: uuidv7(),
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            ogrenci_id: request.params.ogrenci_id,
            yazar_id: y.uyelikId,
            donem_baslangic: g.donem_baslangic,
            donem_bitis: g.donem_bitis ?? g.donem_baslangic,
            brans_kodu: g.brans_kodu ?? null,
            calisma_duzeni: g.calisma_duzeni ?? null,
            derse_katilim: g.derse_katilim ?? null,
            odev_disiplini: g.odev_disiplini ?? null,
            anlama_duzeyi: g.anlama_duzeyi ?? null,
            yorum: g.yorum ?? null,
            ogrenci_gorur: g.ogrenci_gorur,
            ogrenci_bildirildi_at: g.ogrenci_gorur ? new Date() : null,
          })
          .returning();
        if (!d) throw new Error('değerlendirme yazılamadı');
        if (g.ogrenci_gorur) await degerlendirmeYayimlandiOlayiYaz(tx, baglam, d);
        return (await degerlendirmeYanitlari(tx, y, [d]))[0];
      });
      if (!sonuc) throw new Error('değerlendirme yanıtı oluşturulamadı');
      return reply.status(201).send(sonuc);
    },
  );

  app.patch(
    '/kurumlar/:kurum_id/degerlendirmeler/:id',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Degerlendirmeyi duzenle: yalniz yazar (baskasi 403; kapsam disi ogrenci 404) ve olusturmadan sonraki 7 gun icinde (sonra 409 `degerlendirme_duzenlenemez`, yeni kayit yazilir); geri cekilmis kayit 409 `degerlendirme_geri_cekildi`. Verilen alanlar degisir, `null` alani temizler; `surum` iyimser kilit (409 `surum_cakismasi`). Gorunurluk kapaliyken acilirsa ogrenciye (bir kez) bildirim olayi yayimlanir.',
        params: kayitParam,
        body: DegerlendirmeGuncelleGirdiSema,
        response: { 200: DegerlendirmeSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      const baglam = olayBaglami(y, request.correlationId);
      return withTenant(db, kiraci(y), async (tx) => {
        const eski = await degerlendirmeBul(tx, y, request.params.id, true);
        if (eski.yazar_id !== y.uyelikId) {
          throw izinYok('Değerlendirmeyi yalnızca yazarı düzenleyebilir.');
        }
        if (eski.geri_cekildi_at !== null) {
          throw new AppError(
            409,
            degerlendirmeHataKodlari.geriCekildi,
            'Geri çekilmiş değerlendirme düzenlenemez.',
          );
        }
        if (!duzenlenebilirMi(eski)) {
          throw new AppError(
            409,
            degerlendirmeHataKodlari.duzenlenemez,
            'Değerlendirme yalnızca yazıldıktan sonraki 7 gün içinde düzenlenebilir; yeni bir değerlendirme yazın.',
          );
        }
        surumUyumluOlmali(eski.surum, g.surum);
        const baslangic = g.donem_baslangic ?? eski.donem_baslangic;
        const bitis = g.donem_bitis ?? eski.donem_bitis;
        if (g.donem_baslangic !== undefined || g.donem_bitis !== undefined) {
          donemiDogrula(baslangic, bitis);
        }
        const brans = g.brans_kodu === undefined ? eski.brans_kodu : g.brans_kodu;
        if (g.brans_kodu) await bransGecerliOlmali(tx, g.brans_kodu);
        // `null` alani temizler; `??` null'i da "verilmedi" sayacagindan bilerek `undefined` denetlenir.
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const pick = <T>(yeni: T | undefined, eskiDeger: T): T =>
          yeni === undefined ? eskiDeger : yeni;
        const yeniDeger = {
          calisma_duzeni: pick(g.calisma_duzeni, eski.calisma_duzeni),
          derse_katilim: pick(g.derse_katilim, eski.derse_katilim),
          odev_disiplini: pick(g.odev_disiplini, eski.odev_disiplini),
          anlama_duzeyi: pick(g.anlama_duzeyi, eski.anlama_duzeyi),
          yorum: pick(g.yorum, eski.yorum),
        };
        if (Object.values(yeniDeger).every((v) => v === null)) {
          throw new AppError(
            422,
            errorCodes.validation,
            'Yorum ya da en az bir ölçek dolu olmalı.',
          );
        }
        const gorur = pick(g.ogrenci_gorur, eski.ogrenci_gorur);
        const bildirimGerekli = gorur && eski.ogrenci_bildirildi_at === null;
        const [yeni] = await tx
          .update(ogretmenDegerlendirmeleri)
          .set({
            ...yeniDeger,
            donem_baslangic: baslangic,
            donem_bitis: bitis,
            brans_kodu: brans,
            ogrenci_gorur: gorur,
            ...(bildirimGerekli ? { ogrenci_bildirildi_at: new Date() } : {}),
          })
          .where(eq(ogretmenDegerlendirmeleri.id, eski.id))
          .returning();
        if (!yeni) throw new Error('değerlendirme güncellenemedi');
        if (bildirimGerekli) await degerlendirmeYayimlandiOlayiYaz(tx, baglam, yeni);
        return (await degerlendirmeYanitlari(tx, y, [yeni]))[0];
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/degerlendirmeler/:id/geri-cek',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Degerlendirmeyi geri cek (silme degil): yazar ya da sahip/yonetici; baskasi 403, kapsam disi 404. Geri cekilen ogrenciye hicbir kosulda gorunmez ve kocluk gorunumunde yer almaz. Tekrar cagri 200 ve ayni kayit.',
        params: kayitParam,
        response: { 200: DegerlendirmeSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const d = await degerlendirmeBul(tx, y, request.params.id, true);
        if (d.yazar_id !== y.uyelikId && !yonetimMi(y)) {
          throw izinYok('Değerlendirmeyi yalnızca yazarı ya da kurum yöneticisi geri çekebilir.');
        }
        if (d.geri_cekildi_at !== null) return (await degerlendirmeYanitlari(tx, y, [d]))[0];
        const [yeni] = await tx
          .update(ogretmenDegerlendirmeleri)
          .set({ geri_cekildi_at: new Date(), geri_cekilen_id: y.uyelikId })
          .where(eq(ogretmenDegerlendirmeleri.id, d.id))
          .returning();
        if (!yeni) throw new Error('değerlendirme geri çekilemedi');
        return (await degerlendirmeYanitlari(tx, y, [yeni]))[0];
      });
    },
  );

  // --- Degerlendirme: listeler -----------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/ogrenciler/:ogrenci_id/degerlendirmeler',
    {
      ...okuPersonel,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Personel: ogrencinin TUM ogretmenlerinin degerlendirmeleri (en yeni once, imlec sayfali; `geri_cekilenler=true` ile geri cekilenler de). Ogretmen yalniz kendi ogrencilerini gorur (kapsam disi 404).',
        params: ogrenciParam,
        querystring: DegerlendirmeListeSorguSema,
        response: { 200: DegerlendirmeListeYanitiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const q = request.query;
      return withTenant(db, kiraci(y), async (tx) => {
        await ogrenciBul(tx, y, request.params.ogrenci_id, false);
        return degerlendirmeSayfasi(tx, y, request.params.ogrenci_id, {
          limit: q.limit,
          imlec: q.imlec,
          geriCekilenler: q.geri_cekilenler,
        });
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/degerlendirmelerim',
    {
      ...okuKendi,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrenci: kendisine GORUNUR isaretlenmis ve geri cekilmemis degerlendirmeler (en yeni once). Yanitta gorunurluk bayragi, yazar kimligi ve surum yoktur. Gorunur olmayan hicbir degerlendirme bu uctan (ya da baska bir uctan) alinamaz; veritabaninda ayrica RESTRICTIVE RLS vardir.',
        params: kurumParam,
        querystring: OgrenciDegerlendirmeListeSorguSema,
        response: { 200: OgrenciDegerlendirmeListeYanitiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y);
      const q = request.query;
      const imlec = imlecCoz(q.imlec);
      return withTenant(db, kiraci(y), async (tx) => {
        const satirlar = await tx
          .select()
          .from(ogretmenDegerlendirmeleri)
          .where(
            and(
              eq(ogretmenDegerlendirmeleri.kurum_id, y.kurumId),
              eq(ogretmenDegerlendirmeleri.ogrenci_id, y.uyelikId),
              eq(ogretmenDegerlendirmeleri.ogrenci_gorur, true),
              isNull(ogretmenDegerlendirmeleri.geri_cekildi_at),
              imlec ? lt(ogretmenDegerlendirmeleri.id, imlec) : undefined,
            ),
          )
          .orderBy(desc(ogretmenDegerlendirmeleri.id))
          .limit(q.limit + 1);
        const sayfa = satirlar.slice(0, q.limit);
        const son = sayfa[sayfa.length - 1];
        return {
          degerlendirmeler: await ogrenciDegerlendirmeYanitlari(tx, sayfa),
          sonraki_imlec: satirlar.length > q.limit && son ? imlecYaz(son.id) : null,
        };
      });
    },
  );

  // --- Kaynak onerisi --------------------------------------------------------------------------

  app.post(
    '/kurumlar/:kurum_id/ogrenciler/:ogrenci_id/kaynak-onerileri',
    {
      ...oneriYaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrenciye kaynak oner: `kaynak_kitap` / `kaynak_kitap_testi` (kurumun aktif kaynak kitaplarindan), `link` (yalniz http/https, baslik zorunlu) ya da `serbest` (baslik). Istege bagli konu (kitap/testte kitabin dersi, link/serbestte `brans_kodu` ile) ve not. Gecersiz kaynak 422 `kaynak_gecersiz`, kapsam disi ogrenci 404. Ogrenciye `ogrenme.kaynak_onerisi.eklendi.v1` (uygulama ici bildirim).',
        params: ogrenciParam,
        body: KaynakOnerisiOlusturGirdiSema,
        response: { 201: KaynakOnerisiSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      const baglam = olayBaglami(y, request.correlationId);
      const sonuc = await withTenant(db, kiraci(y), async (tx) => {
        await ogrenciBul(tx, y, request.params.ogrenci_id);
        const kaynakGecersiz = (mesaj: string) =>
          new AppError(422, degerlendirmeHataKodlari.kaynakGecersiz, mesaj);
        let kitapId: string | null = null;
        let testId: string | null = null;
        let brans: string | null;
        if (g.tur === 'kaynak_kitap') {
          const [k] = await tx
            .select({ id: kaynakKitaplar.id, brans_kodu: kaynakKitaplar.brans_kodu })
            .from(kaynakKitaplar)
            .where(
              and(
                eq(kaynakKitaplar.id, g.kaynak_kitap_id),
                eq(kaynakKitaplar.kurum_id, y.kurumId),
                eq(kaynakKitaplar.aktif, true),
              ),
            );
          if (!k) throw kaynakGecersiz('Kaynak kitap bulunamadı ya da pasif.');
          kitapId = k.id;
          brans = k.brans_kodu;
        } else if (g.tur === 'kaynak_kitap_testi') {
          const [t] = await tx
            .select({
              id: kaynakKitapTestleri.id,
              kitap_id: kaynakKitapTestleri.kitap_id,
              brans_kodu: kaynakKitaplar.brans_kodu,
            })
            .from(kaynakKitapTestleri)
            .innerJoin(kaynakKitaplar, eq(kaynakKitaplar.id, kaynakKitapTestleri.kitap_id))
            .where(
              and(
                eq(kaynakKitapTestleri.id, g.kaynak_test_id),
                eq(kaynakKitapTestleri.kurum_id, y.kurumId),
                eq(kaynakKitaplar.aktif, true),
              ),
            );
          if (!t) throw kaynakGecersiz('Kaynak testi bulunamadı ya da kitabı pasif.');
          testId = t.id;
          kitapId = t.kitap_id;
          brans = t.brans_kodu;
        } else {
          brans = g.brans_kodu ?? null;
          if (brans) await bransGecerliOlmali(tx, brans);
        }
        if (g.konu_id) {
          if (!brans) throw kaynakGecersiz('Konu için ders belirtilmeli.');
          await bransVeKonuDogrula(tx, brans, g.konu_id);
        }
        const [o] = await tx
          .insert(kaynakOnerileri)
          .values({
            id: uuidv7(),
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            ogrenci_id: request.params.ogrenci_id,
            oneren_id: y.uyelikId,
            tur: g.tur,
            kaynak_kitap_id: kitapId,
            kaynak_test_id: testId,
            baglanti_url: g.tur === 'link' ? g.baglanti_url : null,
            baslik: g.tur === 'link' || g.tur === 'serbest' ? g.baslik : null,
            brans_kodu: brans,
            konu_id: g.konu_id ?? null,
            not_metni: g.not ?? null,
          })
          .returning();
        if (!o) throw new Error('kaynak önerisi yazılamadı');
        await oneriOlayiYaz(tx, baglam, o);
        return (await oneriYanitlari(tx, y, [o]))[0];
      });
      if (!sonuc) throw new Error('öneri yanıtı oluşturulamadı');
      return reply.status(201).send(sonuc);
    },
  );

  app.get(
    '/kurumlar/:kurum_id/ogrenciler/:ogrenci_id/kaynak-onerileri',
    {
      ...oneriOkuPersonel,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Personel: ogrenciye onerilen kaynaklar (en yeni once) ve `basladi` durumu (oneriden sonra gunluk soru kaydinda o kitap/test/metin kullanildiysa true; `link` icin null). `geri_cekilenler=true` ile geri cekilenler de.',
        params: ogrenciParam,
        querystring: KaynakOnerisiListeSorguSema,
        response: { 200: KaynakOnerisiListeYanitiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const q = request.query;
      return withTenant(db, kiraci(y), async (tx) => {
        await ogrenciBul(tx, y, request.params.ogrenci_id, false);
        const satirlar = await tx
          .select()
          .from(kaynakOnerileri)
          .where(
            and(
              eq(kaynakOnerileri.kurum_id, y.kurumId),
              eq(kaynakOnerileri.ogrenci_id, request.params.ogrenci_id),
              q.geri_cekilenler ? undefined : isNull(kaynakOnerileri.geri_cekildi_at),
            ),
          )
          .orderBy(desc(kaynakOnerileri.id))
          .limit(q.limit);
        return { oneriler: await oneriYanitlari(tx, y, satirlar) };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/kaynak-onerilerim',
    {
      ...oneriOkuKendi,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrenci: kendisine onerilen (geri cekilmeyen) kaynaklar, en yeni once ("Ogretmenimin onerdikleri"). Tek dokunusla gunluk kayitta kaynak olarak secilir; `basladi` kendi kayitlarindan hesaplanir.',
        params: kurumParam,
        querystring: KaynakOnerisiListeSorguSema.pick({ limit: true }),
        response: { 200: KaynakOnerisiListeYanitiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y);
      return withTenant(db, kiraci(y), async (tx) => {
        const satirlar = await tx
          .select()
          .from(kaynakOnerileri)
          .where(
            and(
              eq(kaynakOnerileri.kurum_id, y.kurumId),
              eq(kaynakOnerileri.ogrenci_id, y.uyelikId),
              isNull(kaynakOnerileri.geri_cekildi_at),
            ),
          )
          .orderBy(desc(kaynakOnerileri.id))
          .limit(request.query.limit);
        return { oneriler: await oneriYanitlari(tx, y, satirlar) };
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/kaynak-onerileri/:id/geri-cek',
    {
      ...oneriYaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Kaynak onerisini geri cek (silme degil): oneren ya da sahip/yonetici; baskasi 403, kapsam disi 404. Tekrar cagri 200.',
        params: kayitParam,
        response: { 200: KaynakOnerisiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const o = await oneriBul(tx, y, request.params.id, true);
        if (o.oneren_id !== y.uyelikId && !yonetimMi(y)) {
          throw izinYok('Öneriyi yalnızca öneren öğretmen ya da kurum yöneticisi geri çekebilir.');
        }
        if (o.geri_cekildi_at !== null) return (await oneriYanitlari(tx, y, [o]))[0];
        const [yeni] = await tx
          .update(kaynakOnerileri)
          .set({ geri_cekildi_at: new Date(), geri_cekilen_id: y.uyelikId })
          .where(eq(kaynakOnerileri.id, o.id))
          .returning();
        if (!yeni) throw new Error('öneri geri çekilemedi');
        return (await oneriYanitlari(tx, y, [yeni]))[0];
      });
    },
  );

  // --- Hatirlatma (Bugun karti) ----------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/degerlendirme-hatirlatma',
    {
      ...yaz,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Bugun karti: bu hafta (Pazartesi-Pazar, Europe/Istanbul) KENDI yazdigi degerlendirmesi olmayan ogrencilerim (kapsamdaki etkin ogrenciler; sahip/yonetici icin herhangi birinin yazdigi). En eski/hic olmayan once, en cok 100; `eksik_sayisi` toplam. Bildirim uretmez.',
        params: kurumParam,
        response: { 200: DegerlendirmeHatirlatmaSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const hafta = haftaBaslangici(planBugunu());
      const haftaSonu = tarihEkle(hafta, 6);
      return withTenant(db, kiraci(y), async (tx) => {
        const kapsam = kapsamdakiOgrenciler(tx, y);
        const yazarKosulu =
          y.rol === 'ogretmen' ? sql`and d.yazar_id = ${y.uyelikId}::uuid` : sql``;
        const satirlar = await tx.execute<
          { ogrenci_id: string; son_gun: string | null; hafta_var: boolean } & Record<
            string,
            unknown
          >
        >(sql`
          select o.id as ogrenci_id,
                 (select max(d.donem_baslangic)::text from ogrenme.ogretmen_degerlendirmeleri d
                   where d.kurum_id = ${y.kurumId}::uuid and d.ogrenci_id = o.id
                     and d.geri_cekildi_at is null ${yazarKosulu}) as son_gun,
                 exists (select 1 from ogrenme.ogretmen_degerlendirmeleri d
                   where d.kurum_id = ${y.kurumId}::uuid and d.ogrenci_id = o.id
                     and d.geri_cekildi_at is null ${yazarKosulu}
                     and d.donem_bitis >= ${hafta}::date and d.donem_baslangic <= ${haftaSonu}::date) as hafta_var
            from (${kapsam}) o`);
        const eksik = satirlar
          .filter((s) => !s.hafta_var)
          .sort(
            (a, b) =>
              (a.son_gun ?? '').localeCompare(b.son_gun ?? '') ||
              a.ogrenci_id.localeCompare(b.ogrenci_id),
          );
        const liste = eksik.slice(0, HATIRLATMA_EN_FAZLA);
        const adlar = await gorunenAdlar(
          tx,
          liste.map((s) => s.ogrenci_id),
        );
        return {
          hafta_baslangic: hafta,
          ogrenci_sayisi: satirlar.length,
          eksik_sayisi: eksik.length,
          ogrenciler: liste.map((s) => ({
            ogrenci_id: s.ogrenci_id,
            ogrenci_ad: adlar.get(s.ogrenci_id) ?? null,
            son_degerlendirme_gun: s.son_gun,
          })),
        };
      });
    },
  );

  return Promise.resolve();
};
