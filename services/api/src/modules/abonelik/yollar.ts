import {
  AbonelikKurumParamSema,
  AbonelikYanitSema,
  FaturaBilgisiGirdiSema,
  FaturaBilgisiYanitSema,
  IptalYanitSema,
  PlanDegistirGirdiSema,
  PlanDegistirYanitSema,
  AbonelikPlanListeYanitSema,
  errorCodes,
  type PlanLimitleri,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { z } from 'zod';

import { denetimKayitlari, kurumFaturaBilgileri, kurumlar } from '../../db/schema.js';
import { abonelikSistemIslemi } from '../../sistem/abonelik-sistem.js';
import { requirePermission, type YetkiBaglami } from '../hesap/index.js';
import {
  abonelikYanitiUret,
  aktifPlanlar,
  gecerliLimitler,
  guncelAbonelik,
  kullanimSayilari,
  limitAsimlari,
  planLimitleri,
  planYaniti,
  yazmaKilitliMi,
} from './abonelik-deposu.js';
import { ETKIN_DURUMLAR, sinirOlarak, sistemVeritabani } from './ortak.js';
import { planDegistirIstegi, yenilemeyiIptalEt, type OlayBaglami } from './yazma.js';

type FaturaBilgisiYaniti = z.infer<typeof FaturaBilgisiYanitSema>;

function yetkiAl(request: { yetki: YetkiBaglami | null }): YetkiBaglami {
  if (!request.yetki) throw new AppError(403, errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
  return request.yetki;
}

const kiraci = (y: YetkiBaglami) => ({
  kurumId: y.kurumId,
  kullaniciId: y.kullaniciId,
  roller: [y.rol],
});

const olayBaglami = (y: YetkiBaglami, correlationId: string): OlayBaglami => ({
  actor: { tur: 'kullanici', id: y.kullaniciId },
  correlationId,
});

function faturaBilgisiYaniti(
  satir: typeof kurumFaturaBilgileri.$inferSelect | undefined,
): FaturaBilgisiYaniti {
  if (!satir) return { fatura_bilgisi: null };
  const adres = FaturaBilgisiGirdiSema.shape.adres.parse(satir.adres);
  return {
    fatura_bilgisi: {
      unvan: satir.unvan,
      vergi_no: satir.vergi_no,
      vergi_dairesi: satir.vergi_dairesi,
      adres,
      eposta: satir.eposta,
      e_fatura_mukellefi: satir.e_fatura_mukellefi,
      surum: satir.surum,
    },
  };
}

/** Denetim kaydi: kisisel/fatura verisi (unvan, vergi no, e-posta) kayda girmez; yalniz eylem ve kurum. */
async function denetimYaz(tx: Tx, y: YetkiBaglami, ip: string, eylem: string): Promise<void> {
  await tx.insert(denetimKayitlari).values({
    id: uuidv7(),
    kurum_id: y.kurumId,
    created_by: y.kullaniciId,
    aktor_kullanici_id: y.kullaniciId,
    aktor_uyelik_id: y.uyelikId,
    eylem,
    hedef_turu: 'kurum',
    hedef_id: y.kurumId,
    ip,
  });
}

/**
 * Sahip uc noktalari: `/v1/abonelik/kurumlar/:kurum_id/...`. `abonelik.*` izinleri kontrol sirasi adim 4'ten
 * (402) muaftir: `askida`/`sona_erdi` kurumun sahibi de plani gorebilir, fatura bilgisini guncelleyebilir ve
 * yeni abonelik baslatabilir. Abonelik yazmalari `api_sistem` ile yapilir (uygulama rolu tabloyu yalniz okur).
 */
export const abonelikYollari: ServicePlugin = (app) => {
  const veritabani = () => {
    if (!app.db) throw new AppError(503, errorCodes.unavailable, 'Veritabanı kullanılamıyor.');
    return app.db;
  };
  const oku = { preHandler: requirePermission('abonelik.oku', { scope: 'kurum' }) };
  const yonet = { preHandler: requirePermission('abonelik.yonet', { scope: 'kurum' }) };
  const tags = ['abonelik'];

  app.get(
    '/kurumlar/:kurum_id/planlar',
    {
      ...oku,
      schema: {
        tags,
        summary: 'Kurum turune uygun aktif planlari listele (plan yukseltme/dusurme secenekleri).',
        params: AbonelikKurumParamSema,
        response: { 200: AbonelikPlanListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(veritabani(), kiraci(y), async (tx) => {
        const [kurum] = await tx
          .select({ tur: kurumlar.tur })
          .from(kurumlar)
          .where(eq(kurumlar.id, y.kurumId));
        if (!kurum) throw new AppError(404, errorCodes.notFound, 'Kurum bulunamadı.');
        return { planlar: (await aktifPlanlar(tx, kurum.tur)).map(planYaniti) };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/abonelik',
    {
      ...oku,
      schema: {
        tags,
        summary:
          'Kurumun aboneligi, gecerli limitleri ve kullanimi (ogrenci/ogretmen sayisi). Etkin abonelik yoksa ucretsiz katman.',
        params: AbonelikKurumParamSema,
        response: { 200: AbonelikYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(veritabani(), kiraci(y), async (tx) => {
        const guncel = await guncelAbonelik(tx, y.kurumId);
        const etkin =
          guncel !== null && (ETKIN_DURUMLAR as readonly string[]).includes(guncel.abonelik.durum);
        const limitler: PlanLimitleri = await gecerliLimitler(tx, y.kurumId);
        const sayilar = await kullanimSayilari(tx, y.kurumId);
        return {
          abonelik: guncel ? await abonelikYanitiUret(tx, guncel) : null,
          ucretsiz: !etkin,
          yazma_kilitli: await yazmaKilitliMi(tx, y.kurumId),
          limitler,
          kullanim: {
            ogrenci: { mevcut: sayilar.ogrenci, ust_sinir: sinirOlarak(limitler.max_ogrenci) },
            ogretmen: { mevcut: sayilar.ogretmen, ust_sinir: sinirOlarak(limitler.max_ogretmen) },
          },
        };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/fatura-bilgileri',
    {
      ...oku,
      schema: {
        tags,
        summary: 'Fatura alici bilgileri (yoksa `fatura_bilgisi: null`).',
        params: AbonelikKurumParamSema,
        response: { 200: FaturaBilgisiYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const [satir] = await withTenant(veritabani(), kiraci(y), (tx) =>
        tx.select().from(kurumFaturaBilgileri).where(eq(kurumFaturaBilgileri.kurum_id, y.kurumId)),
      );
      return faturaBilgisiYaniti(satir);
    },
  );

  app.put(
    '/kurumlar/:kurum_id/fatura-bilgileri',
    {
      ...yonet,
      schema: {
        tags,
        summary:
          'Fatura alici bilgilerini yaz (kurum basina tek kayit; yoksa olusturur). Vergi no 10 haneli VKN veya 11 haneli TCKN.',
        params: AbonelikKurumParamSema,
        body: FaturaBilgisiGirdiSema,
        response: { 200: FaturaBilgisiYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const g = request.body;
      const [satir] = await withTenant(veritabani(), kiraci(y), async (tx) => {
        const degerler = {
          unvan: g.unvan,
          vergi_no: g.vergi_no,
          vergi_dairesi: g.vergi_dairesi,
          adres: g.adres,
          eposta: g.eposta,
          e_fatura_mukellefi: g.e_fatura_mukellefi,
        };
        const yazilan = await tx
          .insert(kurumFaturaBilgileri)
          .values({ id: uuidv7(), kurum_id: y.kurumId, created_by: y.kullaniciId, ...degerler })
          .onConflictDoUpdate({ target: kurumFaturaBilgileri.kurum_id, set: degerler })
          .returning();
        await denetimYaz(tx, y, request.ip, 'abonelik.fatura_bilgisi_yaz');
        return yazilan;
      });
      return faturaBilgisiYaniti(satir);
    },
  );

  app.post(
    '/kurumlar/:kurum_id/abonelik/iptal',
    {
      ...yonet,
      schema: {
        tags,
        summary:
          'Otomatik yenilemeyi iptal et: abonelik donem sonunda sona erer, o zamana kadar tam erisim surer. Tekrar cagri etkisizdir. Magaza aboneligi 409 magaza_uzerinden_yonetilir; etkin abonelik yoksa 409 etkin_abonelik_yok.',
        params: AbonelikKurumParamSema,
        response: { 200: IptalYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const satir = await abonelikSistemIslemi(
        sistemVeritabani(app.kimlik.sistemDb),
        {
          eylem: 'sistem.abonelik_iptal_istegi',
          neden: 'Sahip otomatik yenilemeyi iptal etti',
          kurumId: y.kurumId,
          aktorKullaniciId: y.kullaniciId,
          istekId: istekKimligi(request.correlationId),
        },
        (tx) => yenilemeyiIptalEt(tx, y.kurumId, olayBaglami(y, request.correlationId)),
      );
      return withTenant(veritabani(), kiraci(y), async (tx) => ({
        abonelik: await abonelikYanitiUret(tx, satir),
      }));
    },
  );

  app.post(
    '/kurumlar/:kurum_id/abonelik/plan-degistir',
    {
      ...yonet,
      schema: {
        tags,
        summary:
          'Plan degistirme istegi. Deneme sirasinda plan hemen degisir; ucretli abonelikte hedef plan donem sonunda uygulanir (odeme baslatma ayri). Hedef planin limiti mevcut kullanimin altindaysa `limit_asimlari` doner; veri silinmez. Kurum turune uymayan plan 404 plan_bulunamadi; etkin abonelik yoksa 409 etkin_abonelik_yok.',
        params: AbonelikKurumParamSema,
        body: PlanDegistirGirdiSema,
        response: { 200: PlanDegistirYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const sonuc = await abonelikSistemIslemi(
        sistemVeritabani(app.kimlik.sistemDb),
        {
          eylem: 'sistem.abonelik_plan_degistir',
          neden: 'Sahip plan değiştirme isteğinde bulundu',
          kurumId: y.kurumId,
          aktorKullaniciId: y.kullaniciId,
          istekId: istekKimligi(request.correlationId),
          ayrinti: { plan_kodu: request.body.plan_kodu },
        },
        (tx) =>
          planDegistirIstegi(
            tx,
            y.kurumId,
            { planKodu: request.body.plan_kodu, periyot: request.body.periyot },
            olayBaglami(y, request.correlationId),
          ),
      );
      return withTenant(veritabani(), kiraci(y), async (tx) => ({
        abonelik: await abonelikYanitiUret(tx, sonuc.satir),
        uygulama: sonuc.uygulama,
        limit_asimlari: await limitAsimlari(tx, y.kurumId, planLimitleri(sonuc.plan)),
      }));
    },
  );

  return Promise.resolve();
};

/** Denetim `istek_id` kolonu UUID ister; korelasyon kimligi UUID degilse yok sayilir. */
function istekKimligi(correlationId: string): string | undefined {
  return correlationId.length === 36 ? correlationId : undefined;
}
