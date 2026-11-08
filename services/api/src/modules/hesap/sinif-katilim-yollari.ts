import {
  KatilimIstekListeSorguSema,
  KatilimIstekListeYanitSema,
  KatilimKoduOlusturGirdiSema,
  KatilimKoduSema,
  KatilimOnayYanitSema,
  errorCodes,
  hesapHataKodlari,
  hesapUyelikDegistiV1,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { and, asc, eq, gt, isNull, sql, type SQL } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import {
  denetimKayitlari,
  grupUyeleri,
  gruplar,
  kullanicilar,
  sinifKatilimIstekleri,
  sinifKatilimKodlari,
  uyelikler,
} from '../../db/schema.js';
import { grubaOgrenciEkle } from './grup-deposu.js';
import { grupKapsami } from './kapsam.js';
import type { YetkiBaglami } from './kimlik.js';
import { olayYaz, type OlayBaglami } from './olaylar.js';
import { katilimKoduUret, katilimKoduYaniti } from './sinif-kodu.js';
import { requirePermission } from './yetki.js';

const kurumParam = z.object({ kurum_id: z.uuid() });
const grupParam = kurumParam.extend({ grup_id: z.uuid() });
const istekParam = grupParam.extend({ istek_id: z.uuid() });
const GUN_MS = 86_400_000;
const KOD_DENEME = 8;

type IstekSatiri = typeof sinifKatilimIstekleri.$inferSelect;

function yetkiAl(request: { yetki: YetkiBaglami | null }): YetkiBaglami {
  if (!request.yetki) throw new AppError(403, errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
  return request.yetki;
}

const kiraci = (y: YetkiBaglami) => ({
  kurumId: y.kurumId,
  kullaniciId: y.kullaniciId,
  roller: [y.rol],
});

const grupBulunamadi = () => new AppError(404, errorCodes.notFound, 'Grup bulunamadı.');
const istekBulunamadi = () => new AppError(404, errorCodes.notFound, 'Katılım isteği bulunamadı.');
const istekBeklemiyor = () =>
  new AppError(409, hesapHataKodlari.istekBeklemiyor, 'Katılım isteği artık beklemiyor.');

/** Kapsamdaki tek grup (kapsam disi = yok); `kilit`: satiri `FOR UPDATE` ile kilitler. */
async function grupBul(tx: Tx, y: YetkiBaglami, grupId: string, kilit = false) {
  const sorgu = tx
    .select()
    .from(gruplar)
    .where(and(eq(gruplar.id, grupId), eq(gruplar.kurum_id, y.kurumId), grupKapsami(tx, y)));
  const [g] = await (kilit ? sorgu.for('update') : sorgu);
  if (!g) throw grupBulunamadi();
  return g;
}

const istekYaniti = (i: IstekSatiri, gorunenAd: string | null) => ({
  id: i.id,
  grup_id: i.grup_id,
  kullanici_id: i.kullanici_id,
  gorunen_ad: gorunenAd,
  durum: i.durum as 'bekliyor' | 'onaylandi' | 'reddedildi' | 'iptal',
  karar_veren_id: i.karar_veren_id,
  karar_at: i.karar_at?.toISOString() ?? null,
  created_at: i.created_at.toISOString(),
});

/** Yonetim eylemi denetim kaydi (kisisel veri yok: yalniz kimlik ve durum). */
async function denetimYaz(
  tx: Tx,
  y: YetkiBaglami,
  ip: string,
  eylem: string,
  hedefId: string,
  once: Record<string, unknown> | null,
  sonra: Record<string, unknown>,
) {
  await tx.insert(denetimKayitlari).values({
    id: uuidv7(),
    kurum_id: y.kurumId,
    created_by: y.kullaniciId,
    aktor_kullanici_id: y.kullaniciId,
    aktor_uyelik_id: y.uyelikId,
    eylem,
    hedef_turu: eylem.startsWith('hesap.sinif_kodu')
      ? 'sinif_katilim_kodu'
      : 'sinif_katilim_istegi',
    hedef_id: hedefId,
    once,
    sonra,
    ip,
  });
}

/** Sinif katilim kodu yonetimi ve ogretmen onayi: `/v1/hesap/kurumlar/:kurum_id/gruplar/:grup_id/...`. */
export const sinifKatilimYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const izin = { preHandler: requirePermission('davet.yaz', { scope: 'grup' as const }) };

  // --- Kod yonetimi --------------------------------------------------------------------

  app.post(
    '/kurumlar/:kurum_id/gruplar/:grup_id/katilim-kodu',
    {
      ...izin,
      schema: {
        tags: ['hesap'],
        summary:
          'Sinif katilim kodu olustur / yenile. Grup basina tek etkin kod vardir; yenileme eski kodu kapatir (eski kod artik gecersiz). Yalniz sinif turu gruplar.',
        params: grupParam,
        body: KatilimKoduOlusturGirdiSema,
        response: { 201: KatilimKoduSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const { gecerlilik_gun, max_kullanim } = request.body;
      const kod = await withTenant(db, kiraci(y), async (tx) => {
        const g = await grupBul(tx, y, request.params.grup_id, true);
        if (g.tur !== 'sinif') {
          throw new AppError(
            422,
            hesapHataKodlari.grupSinifDegil,
            'Katılım kodu yalnızca sınıf türü gruplar için oluşturulur.',
          );
        }
        if (g.durum !== 'aktif') {
          throw new AppError(
            409,
            hesapHataKodlari.grupArsivde,
            'Arşivlenmiş grup için kod üretilemez.',
          );
        }
        const eskiler = await tx
          .update(sinifKatilimKodlari)
          .set({ aktif: false, iptal_at: sql`now()` })
          .where(and(eq(sinifKatilimKodlari.grup_id, g.id), eq(sinifKatilimKodlari.aktif, true)))
          .returning({ id: sinifKatilimKodlari.id });
        for (let deneme = 0; deneme < KOD_DENEME; deneme++) {
          const [yeni] = await tx
            .insert(sinifKatilimKodlari)
            .values({
              id: uuidv7(),
              kurum_id: y.kurumId,
              grup_id: g.id,
              kod: katilimKoduUret(),
              expires_at: gecerlilik_gun ? new Date(Date.now() + gecerlilik_gun * GUN_MS) : null,
              max_kullanim: max_kullanim ?? null,
              created_by: y.kullaniciId,
            })
            .onConflictDoNothing({ target: sinifKatilimKodlari.kod })
            .returning();
          if (yeni) {
            await denetimYaz(
              tx,
              y,
              request.ip,
              'hesap.sinif_kodu_olustur',
              yeni.id,
              eskiler.length > 0 ? { onceki_kod_id: eskiler[0]?.id ?? null } : null,
              { grup_id: g.id, yenileme: eskiler.length > 0 },
            );
            return yeni;
          }
        }
        throw new Error('katılım kodu üretilemedi');
      });
      return reply.status(201).send(katilimKoduYaniti(kod));
    },
  );

  app.get(
    '/kurumlar/:kurum_id/gruplar/:grup_id/katilim-kodu',
    {
      ...izin,
      schema: {
        tags: ['hesap'],
        summary: 'Grubun etkin katilim kodu (yoksa 404).',
        params: grupParam,
        response: { 200: KatilimKoduSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const g = await grupBul(tx, y, request.params.grup_id);
        const [k] = await tx
          .select()
          .from(sinifKatilimKodlari)
          .where(and(eq(sinifKatilimKodlari.grup_id, g.id), eq(sinifKatilimKodlari.aktif, true)));
        if (!k) throw new AppError(404, errorCodes.notFound, 'Bu grup için etkin kod yok.');
        return katilimKoduYaniti(k);
      });
    },
  );

  app.delete(
    '/kurumlar/:kurum_id/gruplar/:grup_id/katilim-kodu',
    {
      ...izin,
      schema: {
        tags: ['hesap'],
        summary:
          'Etkin katilim kodunu kapat. Bekleyen istekler etkilenmez; kod artik yeni istek kabul etmez. Etkin kod yoksa 404.',
        params: grupParam,
        response: { 200: KatilimKoduSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const g = await grupBul(tx, y, request.params.grup_id, true);
        const [k] = await tx
          .update(sinifKatilimKodlari)
          .set({ aktif: false, iptal_at: sql`now()` })
          .where(and(eq(sinifKatilimKodlari.grup_id, g.id), eq(sinifKatilimKodlari.aktif, true)))
          .returning();
        if (!k) throw new AppError(404, errorCodes.notFound, 'Bu grup için etkin kod yok.');
        await denetimYaz(
          tx,
          y,
          request.ip,
          'hesap.sinif_kodu_kapat',
          k.id,
          { aktif: true },
          {
            aktif: false,
          },
        );
        return katilimKoduYaniti(k);
      });
    },
  );

  // --- Katilim istekleri ---------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/gruplar/:grup_id/katilim-istekleri',
    {
      ...izin,
      schema: {
        tags: ['hesap'],
        summary:
          'Grubun katilim isteklerini listele (durum suzgeci, sayfali). Yalniz gorunen ad doner; telefon ve e-posta donmez.',
        params: grupParam,
        querystring: KatilimIstekListeSorguSema,
        response: { 200: KatilimIstekListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { durum, limit, imlec } = request.query;
      return withTenant(db, kiraci(y), async (tx) => {
        const g = await grupBul(tx, y, request.params.grup_id);
        const kosullar: (SQL | undefined)[] = [
          eq(sinifKatilimIstekleri.kurum_id, y.kurumId),
          eq(sinifKatilimIstekleri.grup_id, g.id),
          durum ? eq(sinifKatilimIstekleri.durum, durum) : undefined,
          imlec ? gt(sinifKatilimIstekleri.id, imlec) : undefined,
        ];
        const satirlar = await tx
          .select({ i: sinifKatilimIstekleri, ad: kullanicilar.gorunen_ad })
          .from(sinifKatilimIstekleri)
          .innerJoin(kullanicilar, eq(kullanicilar.id, sinifKatilimIstekleri.kullanici_id))
          .where(and(...kosullar))
          .orderBy(asc(sinifKatilimIstekleri.id))
          .limit(limit + 1);
        const sayfa = satirlar.slice(0, limit);
        return {
          istekler: sayfa.map((s) => istekYaniti(s.i, s.ad)),
          sonraki_imlec: satirlar.length > limit ? (sayfa.at(-1)?.i.id ?? null) : null,
        };
      });
    },
  );

  /** Kilitli istegi ve kullanici adini getirir; baska grubun istegi "yok" sayilir. */
  async function istekKilitle(tx: Tx, y: YetkiBaglami, grupId: string, istekId: string) {
    const [i] = await tx
      .select()
      .from(sinifKatilimIstekleri)
      .where(
        and(
          eq(sinifKatilimIstekleri.id, istekId),
          eq(sinifKatilimIstekleri.grup_id, grupId),
          eq(sinifKatilimIstekleri.kurum_id, y.kurumId),
        ),
      )
      .for('update');
    if (!i) throw istekBulunamadi();
    const [k] = await tx
      .select({ ad: kullanicilar.gorunen_ad })
      .from(kullanicilar)
      .where(eq(kullanicilar.id, i.kullanici_id));
    return { istek: i, ad: k?.ad ?? null };
  }

  /** Onayli istegin olusturdugu uyelik ve etkin grup uyeligi (cift onayda yanit icin). */
  async function onayliKayitlar(tx: Tx, kurumId: string, grupId: string, kullaniciId: string) {
    const [u] = await tx
      .select({ id: uyelikler.id })
      .from(uyelikler)
      .where(
        and(
          eq(uyelikler.kurum_id, kurumId),
          eq(uyelikler.kullanici_id, kullaniciId),
          eq(uyelikler.rol, 'ogrenci'),
        ),
      );
    if (!u) return { uyelikId: null, grupUyesiId: null };
    const [gu] = await tx
      .select({ id: grupUyeleri.id })
      .from(grupUyeleri)
      .where(
        and(
          eq(grupUyeleri.grup_id, grupId),
          eq(grupUyeleri.ogrenci_id, u.id),
          isNull(grupUyeleri.bitis_tarihi),
        ),
      );
    return { uyelikId: u.id, grupUyesiId: gu?.id ?? null };
  }

  app.post(
    '/kurumlar/:kurum_id/gruplar/:grup_id/katilim-istekleri/:istek_id/onayla',
    {
      ...izin,
      schema: {
        tags: ['hesap'],
        summary:
          'Katilim istegini onayla: ogrenci uyeligi (yoksa) olusur ve ogrenci gruba sinif_kodu yoluyla eklenir. Kapasite dolu: 409 kapasite_dolu; kod kullanim siniri dolu: 409 kod_kullanim_doldu. Tekrar onay etkisizdir.',
        params: istekParam,
        response: { 200: KatilimOnayYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const baglam: OlayBaglami = {
        kurumId: y.kurumId,
        actor: { tur: 'kullanici', id: y.kullaniciId },
        correlationId: request.correlationId,
      };
      return withTenant(db, kiraci(y), async (tx) => {
        const g = await grupBul(tx, y, request.params.grup_id);
        const { istek, ad } = await istekKilitle(tx, y, g.id, request.params.istek_id);

        if (istek.durum === 'onaylandi') {
          const k = await onayliKayitlar(tx, y.kurumId, g.id, istek.kullanici_id);
          return {
            istek: istekYaniti(istek, ad),
            uyelik_id: k.uyelikId,
            grup_uyesi_id: k.grupUyesiId,
          };
        }
        if (istek.durum !== 'bekliyor') throw istekBeklemiyor();

        const [mevcut] = await tx
          .select()
          .from(uyelikler)
          .where(
            and(
              eq(uyelikler.kurum_id, y.kurumId),
              eq(uyelikler.kullanici_id, istek.kullanici_id),
              eq(uyelikler.rol, 'ogrenci'),
            ),
          );
        let uyelikId: string;
        let yeniUyelik = false;
        if (!mevcut) {
          uyelikId = uuidv7();
          yeniUyelik = true;
          await tx.insert(uyelikler).values({
            id: uyelikId,
            kurum_id: y.kurumId,
            kullanici_id: istek.kullanici_id,
            rol: 'ogrenci',
            durum: 'aktif',
            sube_id: g.sube_id,
            kademe_id: g.kademe_id,
            gorunen_ad: ad,
            katildi_at: new Date(),
            created_by: y.kullaniciId,
          });
        } else if (mevcut.durum === 'aktif') {
          uyelikId = mevcut.id;
        } else if (mevcut.durum === 'askida') {
          throw new AppError(
            409,
            hesapHataKodlari.uyelikAskida,
            'Öğrencinin üyeliği askıda; önce üyeliği etkinleştirin.',
          );
        } else {
          // ayrildi / davetli: yeniden etkinlestir.
          uyelikId = mevcut.id;
          yeniUyelik = true;
          await tx
            .update(uyelikler)
            .set({ durum: 'aktif', ayrildi_at: null, katildi_at: new Date() })
            .where(eq(uyelikler.id, mevcut.id));
        }
        if (yeniUyelik) {
          await olayYaz(tx, hesapUyelikDegistiV1, baglam, {
            uyelik_id: uyelikId,
            kullanici_id: istek.kullanici_id,
            rol: 'ogrenci',
            durum: 'aktif',
            sube_id: mevcut?.sube_id ?? g.sube_id,
            kademe_id: mevcut?.kademe_id ?? g.kademe_id,
          });
        }

        // Grup satirini kilitler, kapasiteyi denetler, grup_uyesi.degisti olayini yazar.
        const ekleme = await grubaOgrenciEkle(tx, {
          kurumId: y.kurumId,
          grupId: g.id,
          ogrenciIdleri: [uyelikId],
          katilimYolu: 'sinif_kodu',
          kullaniciId: y.kullaniciId,
          baglam,
        });

        if (ekleme.eklenenler.length > 0) {
          // max_kullanim onayda da denetlenir; asilirsa tum islem geri alinir.
          const [kod] = await tx
            .update(sinifKatilimKodlari)
            .set({ kullanim_sayisi: sql`${sinifKatilimKodlari.kullanim_sayisi} + 1` })
            .where(
              and(
                eq(sinifKatilimKodlari.id, istek.kod_id),
                sql`(${sinifKatilimKodlari.max_kullanim} is null or ${sinifKatilimKodlari.kullanim_sayisi} < ${sinifKatilimKodlari.max_kullanim})`,
              ),
            )
            .returning({ id: sinifKatilimKodlari.id });
          if (!kod) {
            throw new AppError(
              409,
              hesapHataKodlari.kodKullanimDoldu,
              'Kodun kullanım sınırı doldu; yeni kod oluşturun.',
            );
          }
        }

        const [guncel] = await tx
          .update(sinifKatilimIstekleri)
          .set({ durum: 'onaylandi', karar_veren_id: y.uyelikId, karar_at: sql`now()` })
          .where(eq(sinifKatilimIstekleri.id, istek.id))
          .returning();
        if (!guncel) throw istekBulunamadi();
        await denetimYaz(
          tx,
          y,
          request.ip,
          'hesap.sinif_katilim_onayla',
          istek.id,
          { durum: 'bekliyor' },
          { durum: 'onaylandi', grup_id: g.id, uyelik_id: uyelikId },
        );
        return {
          istek: istekYaniti(guncel, ad),
          uyelik_id: uyelikId,
          grup_uyesi_id: ekleme.eklenenler[0]?.id ?? null,
        };
      });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/gruplar/:grup_id/katilim-istekleri/:istek_id/reddet',
    {
      ...izin,
      schema: {
        tags: ['hesap'],
        summary:
          'Katilim istegini reddet: ogrenci eklenmez. Tekrar red etkisizdir; onaylanmis/iptal istek reddedilemez (409).',
        params: istekParam,
        response: { 200: KatilimOnayYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const g = await grupBul(tx, y, request.params.grup_id);
        const { istek, ad } = await istekKilitle(tx, y, g.id, request.params.istek_id);
        if (istek.durum === 'reddedildi') {
          return { istek: istekYaniti(istek, ad), uyelik_id: null, grup_uyesi_id: null };
        }
        if (istek.durum !== 'bekliyor') throw istekBeklemiyor();
        const [guncel] = await tx
          .update(sinifKatilimIstekleri)
          .set({ durum: 'reddedildi', karar_veren_id: y.uyelikId, karar_at: sql`now()` })
          .where(eq(sinifKatilimIstekleri.id, istek.id))
          .returning();
        if (!guncel) throw istekBulunamadi();
        await denetimYaz(
          tx,
          y,
          request.ip,
          'hesap.sinif_katilim_reddet',
          istek.id,
          { durum: 'bekliyor' },
          { durum: 'reddedildi', grup_id: g.id },
        );
        return { istek: istekYaniti(guncel, ad), uyelik_id: null, grup_uyesi_id: null };
      });
    },
  );

  return Promise.resolve();
};
