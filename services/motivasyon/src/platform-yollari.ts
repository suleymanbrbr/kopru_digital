import {
  PlatformAyarGeriAlIstegiSema,
  PlatformAyarGuncellemeIstegiSema,
  PlatformAyarSurumuSema,
  PlatformAyarlarSorguSema,
  PlatformAyarlarYanitiSema,
  errorCodes,
} from '@kopru/contracts';
import {
  AppError,
  createDb,
  type AuthContext,
  type Database,
  type ServicePlugin,
} from '@kopru/service-kit';

import { gecerliAyar, surumGetir, surumleriListele, yeniSurumYaz } from './platform-ayar.js';
import { platformYoneticisiGerekli, type PlatformErisimi } from './platform-yetki.js';

export interface PlatformYolSecenekleri extends PlatformErisimi {
  /** `motivasyon_sistem` baglantisi (BYPASSRLS, yapilandirma tablolarini yazar). Yoksa uclar 503. */
  sistemUrl: string | undefined;
}

/**
 * Platform ayar uclari (`/platform/motivasyon/ayarlar`). Kiraci baglami yok (global ayar); okuma ve yazim
 * `motivasyon_sistem` baglantisiyla yapilir, yetki `platformYoneticisiGerekli`dedir.
 */
export function platformYollari(secenek: PlatformYolSecenekleri): ServicePlugin {
  return (app) => {
    const sistem: Database | null = secenek.sistemUrl
      ? createDb({ url: secenek.sistemUrl, max: 3 })
      : null;
    if (sistem) app.addHook('onClose', () => sistem.close());

    const kontrol = (request: { auth: AuthContext | null; ip: string }) => {
      const kimlik = platformYoneticisiGerekli(request.auth, request.ip, secenek);
      if (!sistem) {
        throw new AppError(
          503,
          errorCodes.unavailable,
          'Platform ayarları için sistem veritabanı bağlantısı yapılandırılmamış.',
        );
      }
      return { kimlik, db: sistem };
    };

    const taban = '/platform/motivasyon/ayarlar';
    const etiket = ['platform-motivasyon'];

    app.get(
      taban,
      {
        schema: {
          tags: etiket,
          summary:
            'Gecerli XP kurallari/tavanlari ve surum gecmisi (yeniden eskiye). Yalniz plat=yonetici.',
          querystring: PlatformAyarlarSorguSema,
          response: { 200: PlatformAyarlarYanitiSema },
        },
      },
      async (request) => {
        const { db } = kontrol(request);
        const [gecerli, gecmis] = await Promise.all([
          gecerliAyar(db.orm),
          surumleriListele(db.orm, request.query.limit),
        ]);
        return { gecerli, gecmis };
      },
    );

    app.put(
      taban,
      {
        schema: {
          tags: etiket,
          summary:
            'Kismi degisiklikle yeni ayar surumu olusturur (zorunlu neden). Gecmis XP degismez, yalniz sonraki olaylar. Aralik/tutarlilik hatasi 422 ayar_gecersiz; duzenli ogrenci varsayimini bozan degisiklik reddedilmez, yanitta uyarilar doner.',
          body: PlatformAyarGuncellemeIstegiSema,
          response: { 200: PlatformAyarSurumuSema },
        },
      },
      async (request) => {
        const { kimlik, db } = kontrol(request);
        const b = request.body;
        return yeniSurumYaz(db, {
          kullaniciId: kimlik.kullaniciId,
          neden: b.neden,
          beklenenSurum: b.beklenen_surum,
          degisiklik: {
            ...(b.kurallar ? { kurallar: b.kurallar } : {}),
            ...(b.tavanlar ? { tavanlar: b.tavanlar } : {}),
          },
        });
      },
    );

    app.post(
      `${taban}/geri-al`,
      {
        schema: {
          tags: etiket,
          summary:
            'Eski bir surumun degerleriyle yeni surum olusturur (gecmis silinmez). Bilinmeyen surum 404; degerler zaten ayniysa 422 degisiklik_yok.',
          body: PlatformAyarGeriAlIstegiSema,
          response: { 201: PlatformAyarSurumuSema },
        },
      },
      async (request, reply) => {
        const { kimlik, db } = kontrol(request);
        const b = request.body;
        const hedef = await surumGetir(db.orm, b.surum);
        if (!hedef) throw new AppError(404, errorCodes.notFound, 'Ayar sürümü bulunamadı.');
        const yeni = await yeniSurumYaz(db, {
          kullaniciId: kimlik.kullaniciId,
          neden: b.neden,
          beklenenSurum: b.beklenen_surum,
          degisiklik: hedef.degerler,
          geriAlinan: hedef.surum,
        });
        void reply.code(201);
        return yeni;
      },
    );

    return Promise.resolve();
  };
}
