import {
  AbonelikKaynakSema,
  AbonelikKurumParamSema,
  FaturaGecmisiYanitSema,
  OdemeBaslatGirdiSema,
  OdemeBaslatYanitSema,
  OdemeGecmisiSorguSema,
  OdemeGecmisiYanitSema,
  abonelikHataKodlari,
  errorCodes,
  type Periyot,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin } from '@kopru/service-kit';
import { desc, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import {
  abonelikOdemeleri,
  faturalar,
  kurumFaturaBilgileri,
  kurumlar,
  odemeOturumlari,
} from '../../db/schema.js';
import { abonelikSistemIslemi } from '../../sistem/abonelik-sistem.js';
import { requirePermission } from '../hesap/index.js';
import { guncelAbonelik, planBul } from './abonelik-deposu.js';
import { kdvEkle } from './kdv.js';
import { ETKIN_DURUMLAR, sistemVeritabani } from './ortak.js';
import { fiyatSec } from './yazma.js';
import { istekKimligi, kiraci, yetkiAl } from './yollar.js';

const UCRETLI_ETKIN: readonly string[] = ['aktif', 'odeme_bekliyor', 'ek_sure'];

/**
 * Sahip icin odeme baslatma, odeme ve fatura gecmisi. Webhook/donus uclari `webhook-yollari.ts`'tedir.
 */
export const odemeYollari: ServicePlugin = (app) => {
  const veritabani = () => {
    if (!app.db) throw new AppError(503, errorCodes.unavailable, 'Veritabanı kullanılamıyor.');
    return app.db;
  };
  const oku = { preHandler: requirePermission('abonelik.oku', { scope: 'kurum' }) };
  const yonet = { preHandler: requirePermission('abonelik.yonet', { scope: 'kurum' }) };
  const tags = ['abonelik'];

  app.post(
    '/kurumlar/:kurum_id/odeme/baslat',
    {
      ...yonet,
      schema: {
        tags,
        summary:
          'Web odemesi (iyzico yinelenen abonelik) baslat: saglayicinin odeme sayfasi adresi ya da gomulecek form doner. Fatura bilgisi yoksa 422 fatura_bilgisi_gerekli; baska kanalda (magaza, kurumsal) etkin ucretli abonelik varsa 409 abonelik_baska_kanalda; iyzico aboneligi zaten aktifse 409 abonelik_zaten_aktif; kanal yapilandirilmamissa 503 odeme_kanali_kapali. Deneme sirasinda ucretliye gecis cift abonelik sayilmaz.',
        params: AbonelikKurumParamSema,
        body: OdemeBaslatGirdiSema,
        response: { 200: OdemeBaslatYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const saglayici = app.abonelikOdeme.iyzico;
      if (!saglayici?.odemeBaslat) {
        throw new AppError(
          503,
          abonelikHataKodlari.odemeKanaliKapali,
          'Web ödemesi şu anda kullanılamıyor.',
        );
      }
      const periyot: Periyot = request.body.periyot;
      const hazir = await withTenant(veritabani(), kiraci(y), async (tx) => {
        const [kurum] = await tx
          .select({ tur: kurumlar.tur })
          .from(kurumlar)
          .where(eq(kurumlar.id, y.kurumId));
        const plan = await planBul(tx, request.body.plan_kodu);
        if (!plan || plan.kurum_turu !== kurum?.tur) {
          throw new AppError(404, abonelikHataKodlari.planBulunamadi, 'Plan bulunamadı.');
        }
        const guncel = await guncelAbonelik(tx, y.kurumId);
        const etkin =
          guncel && (ETKIN_DURUMLAR as readonly string[]).includes(guncel.abonelik.durum)
            ? guncel.abonelik
            : null;
        if (etkin && etkin.kaynak !== 'iyzico' && UCRETLI_ETKIN.includes(etkin.durum)) {
          throw new AppError(
            409,
            abonelikHataKodlari.abonelikBaskaKanalda,
            etkin.kaynak === 'apple' || etkin.kaynak === 'google'
              ? 'Aboneliğin App Store veya Google Play üzerinden etkin; web üzerinden ikinci bir abonelik başlatılamaz.'
              : 'Kurumunun kurumsal aboneliği etkin; web üzerinden ikinci bir abonelik başlatılamaz.',
            { kaynak: AbonelikKaynakSema.parse(etkin.kaynak) },
          );
        }
        if (etkin?.kaynak === 'iyzico' && etkin.durum === 'aktif') {
          throw new AppError(
            409,
            abonelikHataKodlari.abonelikZatenAktif,
            'Aboneliğin zaten aktif; plan değişikliği için plan değiştirme isteğini kullan.',
          );
        }
        const [alici] = await tx
          .select()
          .from(kurumFaturaBilgileri)
          .where(eq(kurumFaturaBilgileri.kurum_id, y.kurumId));
        if (!alici) {
          throw new AppError(
            422,
            abonelikHataKodlari.faturaBilgisiGerekli,
            'Ödeme başlatmak için önce fatura bilgilerini gir.',
          );
        }
        return { plan, alici };
      });
      const { plan, alici } = hazir;
      const bolum = kdvEkle(fiyatSec(plan, periyot), plan.kdv_orani);
      const oturumId = uuidv7();
      const adres = alici.adres as {
        satir: string;
        ilce: string;
        il: string;
        posta_kodu?: string;
      };
      const sonuc = await saglayici.odemeBaslat({
        kurumId: y.kurumId,
        oturumId,
        planKodu: plan.kod,
        periyot,
        tutarKurus: bolum.toplamKurus,
        donusUrl: app.abonelikOdeme.donusUrl,
        alici: {
          unvan: alici.unvan,
          vergiNo: alici.vergi_no,
          eposta: alici.eposta,
          adres: {
            satir: adres.satir,
            ilce: adres.ilce,
            il: adres.il,
            postaKodu: adres.posta_kodu,
          },
        },
      });
      await abonelikSistemIslemi(
        sistemVeritabani(app.kimlik.sistemDb),
        {
          eylem: 'sistem.abonelik_odeme_baslat',
          neden: 'Sahip web ödemesi başlattı',
          kurumId: y.kurumId,
          aktorKullaniciId: y.kullaniciId,
          istekId: istekKimligi(request.correlationId),
          ayrinti: { plan_kodu: plan.kod, periyot },
        },
        (tx) =>
          tx.insert(odemeOturumlari).values({
            id: oturumId,
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            kaynak: 'iyzico',
            dis_islem_id: sonuc.disIslemId,
            plan_id: plan.id,
            periyot,
            tutar_kurus: bolum.toplamKurus,
            kdv_kurus: bolum.kdvKurus,
          }),
      );
      return {
        oturum_id: oturumId,
        kaynak: 'iyzico' as const,
        yonlendirme_url: sonuc.yonlendirmeUrl,
        form_icerigi: sonuc.formIcerigi,
        tutar_kurus: bolum.toplamKurus,
        kdv_kurus: bolum.kdvKurus,
      };
    },
  );

  app.get(
    '/kurumlar/:kurum_id/odemeler',
    {
      ...oku,
      schema: {
        tags,
        summary: 'Abonelik odeme gecmisi (basarili, basarisiz, iade); en yeni ustte.',
        params: AbonelikKurumParamSema,
        querystring: OdemeGecmisiSorguSema,
        response: { 200: OdemeGecmisiYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const satirlar = await withTenant(veritabani(), kiraci(y), (tx) =>
        tx
          .select()
          .from(abonelikOdemeleri)
          .where(eq(abonelikOdemeleri.kurum_id, y.kurumId))
          .orderBy(desc(abonelikOdemeleri.odeme_at), desc(abonelikOdemeleri.id))
          .limit(request.query.limit),
      );
      return {
        odemeler: satirlar.map((o) => ({
          id: o.id,
          abonelik_id: o.abonelik_id,
          kaynak: AbonelikKaynakSema.parse(o.kaynak),
          durum: o.durum as 'basarili',
          tutar_kurus: o.tutar_kurus,
          kdv_kurus: o.kdv_kurus,
          donem_baslangic_at: o.donem_baslangic_at.toISOString(),
          donem_bitis_at: o.donem_bitis_at.toISOString(),
          odeme_at: o.odeme_at.toISOString(),
          hata_kodu: o.hata_kodu,
          ters_cevrilen_id: o.ters_cevrilen_id,
        })),
      };
    },
  );

  app.get(
    '/kurumlar/:kurum_id/faturalar',
    {
      ...oku,
      schema: {
        tags,
        summary:
          'e-Arsiv fatura gecmisi (meta). PDF dosyasi hazir degilse `pdf_dosya_id` null doner; en yeni ustte.',
        params: AbonelikKurumParamSema,
        querystring: OdemeGecmisiSorguSema,
        response: { 200: FaturaGecmisiYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const satirlar = await withTenant(veritabani(), kiraci(y), (tx) =>
        tx
          .select()
          .from(faturalar)
          .where(eq(faturalar.kurum_id, y.kurumId))
          .orderBy(desc(faturalar.created_at), desc(faturalar.id))
          .limit(request.query.limit),
      );
      return {
        faturalar: satirlar.map((f) => ({
          id: f.id,
          odeme_id: f.odeme_id,
          tur: f.tur as 'e_arsiv',
          durum: f.durum as 'bekliyor',
          fatura_no: f.fatura_no,
          matrah_kurus: f.matrah_kurus,
          kdv_kurus: f.kdv_kurus,
          toplam_kurus: f.toplam_kurus,
          kdv_orani: f.kdv_orani,
          kesim_at: f.kesim_at?.toISOString() ?? null,
          pdf_dosya_id: f.pdf_dosya_id,
        })),
      };
    },
  );

  return Promise.resolve();
};
