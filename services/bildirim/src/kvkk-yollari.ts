import { KVKK_VERI_SCOPE, KullaniciVeriIstegiSema, KullaniciVeriYanitSema } from '@kopru/contracts';
import { withTenant, type ServicePlugin } from '@kopru/service-kit';

import { kvkkVeri } from './kvkk.js';

/** `POST /ic/kvkk/veri`: yalniz servis JWT'si (`aud=bildirim`, `scope=kvkk.veri`); api cagirir. */
export const kvkkYollari: ServicePlugin = (app) => {
  const { db } = app;
  if (!db) return Promise.resolve();
  app.post(
    '/ic/kvkk/veri',
    {
      config: { servisScope: KVKK_VERI_SCOPE },
      schema: {
        tags: ['ic'],
        summary:
          'Ic uc (servis JWT, `scope=kvkk.veri`): kullanicinin bu kurumdaki bildirim verisi (KVKK disa aktarma).',
        body: KullaniciVeriIstegiSema,
        response: { 200: KullaniciVeriYanitSema },
      },
    },
    async (request) => {
      const g = request.body;
      const bolumler = await withTenant(
        db,
        { kurumId: g.kurum_id, kullaniciId: g.kullanici_id },
        (tx) => kvkkVeri(tx, g),
      );
      return { servis: 'bildirim' as const, bolumler };
    },
  );
  return Promise.resolve();
};
