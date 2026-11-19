import {
  TaklitBaslatGirdiSema,
  TaklitBaslatYanitSema,
  TaklitSonlandirYanitSema,
  errorCodes,
} from '@kopru/contracts';
import { AppError, type ServicePlugin } from '@kopru/service-kit';
import { z } from 'zod';

import { platformTaklitBaslat, platformTaklitSonlandir } from '../../../sistem/platform-taklit.js';
import { erisimBelirteciUret } from '../erisim-belirteci.js';
import { denetimAlanlari, platformIslem, sistemDbAl, yoneticiMi } from './ortak.js';

const tag = ['platform'];

/**
 * Taklit (ADR 0004): hedef kullanici, kurum ve en az 10 karakterlik nedenle baslar; 15 dakikalik, yenilenemez,
 * salt okunur JWT (`imp`, `sub` = hedef, `aktor` = platform kullanicisi, `sid` = taklit kaydi) doner.
 * Belirtecle gelen her istek kokteki kancada canli dogrulanir ve `taklit_kayit_id` ile denetime yazilir.
 */
export const taklitYollari: ServicePlugin = (app) => {
  const { kimlik } = app;

  app.post(
    '/taklit',
    {
      config: { platformEylem: 'platform.taklit_baslat', platformRolu: 'destek' },
      schema: {
        tags: tag,
        summary: 'Kullanıcıyı salt okunur taklit et (15 dk, yenilenemez)',
        body: TaklitBaslatGirdiSema,
        response: { 200: TaklitBaslatYanitSema },
      },
    },
    async (request) => {
      const p = request.platform;
      if (!p) throw new AppError(401, errorCodes.unauthorized, 'Oturum açmanız gerekiyor.');
      const { hedef_kullanici_id: hedefId, kurum_id: kurumId, neden } = request.body;
      denetimAlanlari(request, { kurumId });
      const sonuc = await platformIslem(
        request,
        (baglam) =>
          platformTaklitBaslat(sistemDbAl(kimlik), baglam, {
            hedefKullaniciId: hedefId,
            kurumId,
            neden,
          }),
        { neden, kurumId },
      );
      if (sonuc.durum === 'hedef_platform_kullanicisi') {
        throw new AppError(403, errorCodes.forbidden, 'Platform kullanıcıları taklit edilemez.');
      }
      if (sonuc.durum !== 'tamam') {
        throw new AppError(404, errorCodes.notFound, 'Kullanıcı bu kurumda aktif üye değil.');
      }
      const token = await erisimBelirteciUret(kimlik.anahtarlar, kimlik.issuer, kimlik.audience, {
        kullaniciId: hedefId,
        sessionId: sonuc.taklitId,
        kurumId,
        uyelikId: sonuc.uyelikId,
        rol: sonuc.rol,
        roller: sonuc.roller,
        taklit: { taklitId: sonuc.taklitId, aktorId: p.kullaniciId, bitis: sonuc.bitisAt },
      });
      return {
        taklit_id: sonuc.taklitId,
        access_token: token,
        token_type: 'Bearer' as const,
        expires_in: Math.max(0, Math.floor((sonuc.bitisAt.getTime() - Date.now()) / 1000)),
        bitis_at: sonuc.bitisAt.toISOString(),
        kurum_id: kurumId,
        hedef_kullanici_id: hedefId,
        rol: sonuc.rol,
      };
    },
  );

  app.post(
    '/taklit/:taklit_id/sonlandir',
    {
      config: { platformEylem: 'platform.taklit_sonlandir', platformRolu: 'destek' },
      schema: {
        tags: tag,
        summary: 'Taklidi erken sonlandır (belirteç hemen 401 olur)',
        description:
          'Taklidi başlatan platform kullanıcısı veya platform yöneticisi çağırabilir. Zaten bitmiş taklitte de 200 döner.',
        params: z.object({ taklit_id: z.uuid() }),
        response: { 200: TaklitSonlandirYanitSema },
      },
    },
    async (request) => {
      const { taklit_id: taklitId } = request.params;
      const sonuc = await platformIslem(request, (baglam) =>
        platformTaklitSonlandir(sistemDbAl(kimlik), baglam, {
          taklitId,
          yonetici: yoneticiMi(request),
        }),
      );
      if (sonuc === 'yok') throw new AppError(404, errorCodes.notFound, 'Taklit kaydı bulunamadı.');
      if (sonuc === 'yasak') {
        throw new AppError(
          403,
          errorCodes.platformIzinYok,
          'Bu taklidi yalnız başlatan veya platform yöneticisi sonlandırabilir.',
        );
      }
      if (sonuc === 'tamam') {
        // Diger servisler de belirteci aninda reddetsin (ADR 0008); `sid` = taklit kaydi.
        try {
          await app.iptal.iptalEt(taklitId);
        } catch (err) {
          request.log.error({ err, taklitId }, 'taklit iptali iptal listesine yazılamadı');
        }
      }
      return { taklit_id: taklitId, sonlandirildi: true as const };
    },
  );
  return Promise.resolve();
};
