import {
  PlatformAbonelikAskiyaAlGirdiSema,
  PlatformAbonelikEylemYanitSema,
  PlatformAbonelikIptalGirdiSema,
  PlatformAbonelikYanitSema,
  PlatformDenemeUzatGirdiSema,
  PlatformEkSureGirdiSema,
  PlatformKurumAskiGirdiSema,
  PlatformKurumAskiYanitSema,
  PlatformKurumsalAktivasyonGirdiSema,
  PlatformPlanDegistirGirdiSema,
  errorCodes,
} from '@kopru/contracts';
import { AppError, type ServicePlugin, type Tx } from '@kopru/service-kit';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { platformKurumunuAc, platformKurumuAskiyaAl } from '../../../sistem/platform-kurum.js';
import {
  kurumsalAktivasyonIslemi,
  platformAbonelikEylemi,
  platformAbonelikOku,
  platformAboneligiAskiyaAl,
  platformAboneligiIptalEt,
  platformDenemeyiUzat,
  platformEkSureVer,
  platformPlanDegistir,
  yazmaKilitliMi,
  type AbonelikVePlan,
  type OlayBaglami,
} from '../../abonelik/index.js';
import { denetimAlanlari, platformIslem, sistemDbAl } from './ortak.js';

const tag = ['platform'];
const kurumParam = z.object({ kurum_id: z.uuid() });
const YONETICI = 'yonetici' as const;

const aski = (satir: { platformAskidaAt: string | null; platformAskiNedeni: string | null }) => ({
  askida: satir.platformAskidaAt !== null,
  neden: satir.platformAskiNedeni,
  askida_at: satir.platformAskidaAt,
});

/**
 * Platform yoneticisinin kurum duzeyi askisi ve abonelik duzeltmeleri (ADR 0004, 2026-11-19). Yalniz
 * `yonetici`; her islem zorunlu nedenle ve denetimle (islemle ayni transaction) yapilir. Abonelik tablolarina
 * yalniz `abonelik/index.ts` fonksiyonlariyla dokunulur.
 */
export const platformAbonelikYollari: ServicePlugin = (app) => {
  const { kimlik } = app;

  // --- Platform askisi (abonelik askisindan ayri) -----------------------------------------------

  app.post(
    '/kurumlar/:kurum_id/askiya-al',
    {
      config: { platformEylem: 'platform.kurum_askiya_al', platformRolu: YONETICI },
      schema: {
        tags: tag,
        summary: 'Kurumu platform olarak askıya al (abonelik askısından ayrı)',
        description:
          'Kurum üyeleri kiracı uçlarında `403 kurum_askida` alır (taklit okuması hariç). `hesap.kurum.degisti.v1` yayımlanır. Abonelik/ödeme işi bu askıyı kaldıramaz; yalnız `/ac` kaldırır. Zaten askıdaysa değişiklik yapılmaz (`degisti=false`).',
        params: kurumParam,
        body: PlatformKurumAskiGirdiSema,
        response: { 200: PlatformKurumAskiYanitSema },
      },
    },
    async (request) => {
      const { kurum_id: kurumId } = request.params;
      const { neden } = request.body;
      denetimAlanlari(request, { kurumId, hedefTuru: 'kurum', hedefId: kurumId });
      const s = await platformIslem(
        request,
        (baglam) =>
          platformKurumuAskiyaAl(
            sistemDbAl(kimlik),
            baglam as typeof baglam & { kurumId: string },
            { neden, correlationId: request.correlationId },
          ),
        { neden },
      );
      if (!s.bulundu) throw new AppError(404, errorCodes.notFound, 'Kurum bulunamadı.');
      if (s.kapali) throw new AppError(409, errorCodes.conflict, 'Kapalı kurum askıya alınamaz.');
      return {
        kurum_id: kurumId,
        durum: s.durum as 'askida',
        platform_aski: aski(s),
        abonelik_kilitli: s.abonelikKilitli,
        degisti: s.degisti,
      };
    },
  );

  app.post(
    '/kurumlar/:kurum_id/ac',
    {
      config: { platformEylem: 'platform.kurum_ac', platformRolu: YONETICI },
      schema: {
        tags: tag,
        summary: 'Platform askısını kaldır',
        description:
          'Abonelik de kilitliyse (`askida`/`sona_erdi`) kurum `askida` kalır (`abonelik_kilitli=true`); abonelik askısını platform bu uçla açmaz (ek süre veya kurumsal aktivasyon kullanın).',
        params: kurumParam,
        body: PlatformKurumAskiGirdiSema,
        response: { 200: PlatformKurumAskiYanitSema },
      },
    },
    async (request) => {
      const { kurum_id: kurumId } = request.params;
      const { neden } = request.body;
      denetimAlanlari(request, { kurumId, hedefTuru: 'kurum', hedefId: kurumId });
      const s = await platformIslem(
        request,
        (baglam) =>
          platformKurumunuAc(sistemDbAl(kimlik), baglam as typeof baglam & { kurumId: string }, {
            correlationId: request.correlationId,
            abonelikKilitliMi: (tx) => yazmaKilitliMi(tx, kurumId),
          }),
        { neden },
      );
      if (!s.bulundu) throw new AppError(404, errorCodes.notFound, 'Kurum bulunamadı.');
      if (s.kapali) throw new AppError(409, errorCodes.conflict, 'Kapalı kurum açılamaz.');
      return {
        kurum_id: kurumId,
        durum: s.durum as 'aktif',
        platform_aski: aski(s),
        abonelik_kilitli: s.abonelikKilitli,
        degisti: s.degisti,
      };
    },
  );

  // --- Abonelik: okuma ve duzeltmeler -----------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/abonelik',
    {
      config: { platformEylem: 'platform.abonelik_oku', platformRolu: YONETICI },
      schema: {
        tags: tag,
        summary: 'Kurum aboneliği: güncel durum, abonelik geçmişi ve ödemeler',
        params: kurumParam,
        response: { 200: PlatformAbonelikYanitSema },
      },
    },
    async (request) => {
      const { kurum_id: kurumId } = request.params;
      denetimAlanlari(request, { kurumId, hedefTuru: 'kurum', hedefId: kurumId });
      const sonuc = await platformIslem(request, (baglam) =>
        platformAbonelikOku(sistemDbAl(kimlik), baglam, kurumId),
      );
      if (!sonuc) throw new AppError(404, errorCodes.notFound, 'Kurum bulunamadı.');
      return sonuc;
    },
  );

  /** Ortak: denetim alanlari + `platformIslem` (denetim islemle ayni transaction'da) + olay baglami. */
  const eylemCalistir = (
    request: FastifyRequest,
    kurumId: string,
    neden: string,
    ayrinti: Record<string, unknown>,
    govde: (tx: Tx, olay: OlayBaglami, aktorId: string) => Promise<AbonelikVePlan>,
  ) => {
    denetimAlanlari(request, { kurumId, hedefTuru: 'kurum', hedefId: kurumId, ayrinti });
    return platformIslem(
      request,
      (baglam) =>
        platformAbonelikEylemi(sistemDbAl(kimlik), baglam, kurumId, (tx) =>
          govde(
            tx,
            {
              actor: { tur: 'kullanici', id: baglam.aktorKullaniciId },
              correlationId: request.correlationId,
            },
            baglam.aktorKullaniciId,
          ),
        ),
      { neden },
    ).then((s) => ({
      abonelik: s.abonelik,
      kurum_durumu: s.kurumDurumu,
      platform_askida: s.platformAskida,
    }));
  };
  const sema = (summary: string, description: string) => ({
    tags: tag,
    summary,
    description,
    params: kurumParam,
    response: { 200: PlatformAbonelikEylemYanitSema },
  });
  const config = (eylem: string) => ({
    platformEylem: `platform.abonelik_${eylem}`,
    platformRolu: YONETICI,
  });
  const on = '/kurumlar/:kurum_id/abonelik';

  app.post(
    `${on}/kurumsal-aktivasyon`,
    {
      config: config('kurumsal_aktivasyon'),
      schema: {
        ...sema(
          'Kurumsal (elle) aboneliği etkinleştir',
          'Teklif + fatura sözleşme numarasıyla kurum aboneliği `kurumsal` kaynakla `aktif` olur; deneme/askıdaki abonelik sona erer. Platform askısındaki kurum bu işlemle açılmaz.',
        ),
        body: PlatformKurumsalAktivasyonGirdiSema,
      },
    },
    (request) => {
      const { kurum_id: kurumId } = request.params;
      const g = request.body;
      return eylemCalistir(
        request,
        kurumId,
        g.neden,
        { plan_kodu: g.plan_kodu, periyot: g.periyot, sozlesme_no: g.sozlesme_no },
        (tx, olay, aktorId) =>
          kurumsalAktivasyonIslemi(tx, {
            kurumId,
            planKodu: g.plan_kodu,
            sozlesmeNo: g.sozlesme_no,
            periyot: g.periyot,
            ...(g.donem_baslangic_at ? { donemBaslangicAt: new Date(g.donem_baslangic_at) } : {}),
            ...(g.donem_bitis_at ? { donemBitisAt: new Date(g.donem_bitis_at) } : {}),
            ...(g.fiyat_kurus === undefined ? {} : { fiyatKurus: g.fiyat_kurus }),
            aktorKullaniciId: aktorId,
            neden: g.neden,
            istekId: olay.correlationId,
          }),
      );
    },
  );

  app.post(
    `${on}/deneme-uzat`,
    {
      config: config('deneme_uzat'),
      schema: {
        ...sema(
          'Deneme süresini uzat',
          'Etkin deneme `gun` kadar uzar; bitmiş (`sona_erdi`) deneme yeniden açılır.',
        ),
        body: PlatformDenemeUzatGirdiSema,
      },
    },
    (request) => {
      const { kurum_id: kurumId } = request.params;
      const g = request.body;
      return eylemCalistir(request, kurumId, g.neden, { gun: g.gun }, (tx, olay) =>
        platformDenemeyiUzat(tx, kurumId, g.gun, olay),
      );
    },
  );

  app.post(
    `${on}/ek-sure`,
    {
      config: config('ek_sure'),
      schema: {
        ...sema(
          'Ek süre ver',
          'Ödemesi bekleyen / ek süredeki / askıdaki (ücretli) abonelik `ek_sure` durumuna alınır ve tam erişim `gun` kadar sürer.',
        ),
        body: PlatformEkSureGirdiSema,
      },
    },
    (request) => {
      const { kurum_id: kurumId } = request.params;
      const g = request.body;
      return eylemCalistir(request, kurumId, g.neden, { gun: g.gun }, (tx, olay) =>
        platformEkSureVer(tx, kurumId, g.gun, olay),
      );
    },
  );

  app.post(
    `${on}/plan-degistir`,
    {
      config: config('plan_degistir'),
      schema: {
        ...sema(
          'Planı değiştir',
          '`hemen=true` (varsayılan) plan/periyodu anında değiştirir; `false` sahip akışıyla aynı biçimde dönem sonunda uygular.',
        ),
        body: PlatformPlanDegistirGirdiSema,
      },
    },
    (request) => {
      const { kurum_id: kurumId } = request.params;
      const g = request.body;
      return eylemCalistir(
        request,
        kurumId,
        g.neden,
        { plan_kodu: g.plan_kodu, periyot: g.periyot ?? null, hemen: g.hemen },
        (tx, olay) =>
          platformPlanDegistir(
            tx,
            kurumId,
            { planKodu: g.plan_kodu, periyot: g.periyot, hemen: g.hemen },
            olay,
          ),
      );
    },
  );

  app.post(
    `${on}/iptal`,
    {
      config: config('iptal'),
      schema: {
        ...sema(
          'Aboneliği iptal et',
          '`hemen=false` (varsayılan): yenileme iptal edilir, dönem sonunda biter. `hemen=true`: abonelik şimdi `iptal` olur.',
        ),
        body: PlatformAbonelikIptalGirdiSema,
      },
    },
    (request) => {
      const { kurum_id: kurumId } = request.params;
      const g = request.body;
      return eylemCalistir(request, kurumId, g.neden, { hemen: g.hemen }, (tx, olay) =>
        platformAboneligiIptalEt(tx, kurumId, g.hemen, olay),
      );
    },
  );

  app.post(
    `${on}/askiya-al`,
    {
      config: config('askiya_al'),
      schema: {
        ...sema(
          'Aboneliği askıya al (platform kurum askısından ayrı)',
          'Etkin abonelik `askida` olur: kurum yazma isteklerinde `402 abonelik_gerekli` alır. Platform kurum askısı için `/kurumlar/:id/askiya-al`.',
        ),
        body: PlatformAbonelikAskiyaAlGirdiSema,
      },
    },
    (request) => {
      const { kurum_id: kurumId } = request.params;
      const g = request.body;
      return eylemCalistir(request, kurumId, g.neden, {}, (tx, olay) =>
        platformAboneligiAskiyaAl(tx, kurumId, olay),
      );
    },
  );

  return Promise.resolve();
};
