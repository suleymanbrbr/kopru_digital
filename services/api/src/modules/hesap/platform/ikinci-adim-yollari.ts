import {
  IkinciAdimDogrulaGirdiSema,
  IkinciAdimKodGirdiSema,
  IkinciAdimKurYanitSema,
  IkinciAdimYanitSema,
  PlatformBenYanitSema,
  errorCodes,
} from '@kopru/contracts';
import { AppError, type ServicePlugin } from '@kopru/service-kit';
import { uuidv7 } from 'uuidv7';

import { platformDenetimYaz } from '../../../sistem/platform-denetim.js';
import {
  ikinciAdimDegerlendir,
  ikinciAdimKurSistem,
  ikinciAdimOzeti,
  oturumIkinciAdimDurumu,
  type IkinciAdimSonucu,
} from '../../../sistem/platform-kimlik.js';
import { platformBaglami, platformIslem, sistemDbAl } from './ortak.js';
import {
  IkinciAdimKasasi,
  base32Kodla,
  otpauthUri,
  totpDogrula,
  yedekKodlariUret,
  yedekKodunuNormallestir,
  yeniSir,
} from './totp.js';

const tag = ['platform'];

/**
 * Platform kullanicisinin TOTP ikinci adimi. Bu uclar `plat` claim'i + IP izin listesi ister ama ikinci
 * adim tamamlanmis olmayi ARAMAZ (kurulum ve dogrulama burada yapilir). Dogrulama oturuma baglanir
 * (`oturumlar.ikinci_adim_at`); yeni giris yeni dogrulama gerektirir.
 */
export const ikinciAdimYollari: ServicePlugin = (app) => {
  const { kimlik } = app;
  const kasa = new IkinciAdimKasasi(kimlik.env.BETTER_AUTH_SECRET);
  const muaf = { ikinciAdimMuaf: true } as const;

  /** Basarisiz/kilitli sonucu HTTP hatasina cevirir. */
  const hataFirlat = (sonuc: IkinciAdimSonucu): void => {
    switch (sonuc.durum) {
      case 'dogrulandi':
        return;
      case 'yanlis':
        throw new AppError(
          400,
          errorCodes.kodGecersiz,
          `Kod geçersiz. Kalan deneme: ${String(sonuc.kalanDeneme)}.`,
        );
      case 'kilitli':
        throw new AppError(
          429,
          errorCodes.rateLimited,
          'Çok fazla yanlış deneme. Bir süre sonra tekrar deneyin.',
        );
      case 'kurulu_degil':
        throw new AppError(
          409,
          errorCodes.conflict,
          'İki adımlı doğrulama bu işlem için hazır değil.',
        );
    }
  };

  app.get(
    '/ben',
    {
      config: { platformEylem: 'platform.ben', ...muaf },
      schema: {
        tags: tag,
        summary: 'Platform kimliğim ve ikinci adım durumum',
        response: { 200: PlatformBenYanitSema },
      },
    },
    async (request) => {
      const p = request.platform;
      const auth = request.auth;
      if (!p || !auth)
        throw new AppError(401, errorCodes.unauthorized, 'Oturum açmanız gerekiyor.');
      const db = sistemDbAl(kimlik);
      const ozet = await ikinciAdimOzeti(db, p.kullaniciId);
      const oturum = auth.sessionId
        ? await oturumIkinciAdimDurumu(db, auth.sessionId)
        : { gecerli: false, ikinciAdimAt: null };
      const taze =
        oturum.ikinciAdimAt !== null &&
        Date.now() - oturum.ikinciAdimAt.getTime() < kimlik.env.PLATFORM_IKINCI_ADIM_OMRU_SN * 1000;
      return {
        kullanici_id: p.kullaniciId,
        platform_rolu: p.rol,
        ikinci_adim: {
          kurulu: ozet.kurulu,
          oturumda_dogrulandi: oturum.gecerli && taze,
          yedek_kod_kalan: ozet.yedekKodKalan,
        },
      };
    },
  );

  app.post(
    '/ikinci-adim/kur',
    {
      config: { platformEylem: 'platform.ikinci_adim_kur', ...muaf },
      schema: {
        tags: tag,
        summary: 'İki adımlı doğrulamayı kur (otpauth URI + yedek kodlar)',
        description:
          'Sır ve yedek kodlar yalnız bu yanıtta gösterilir. Kurulum `onayla` ile bir kodla onaylanana kadar etkin değildir; onaylanmış kurulum yeniden yapılamaz (409). Sıfırlama yalnız `platform:yonetici-ekle --2fa-sifirla` betiğiyle.',
        response: { 200: IkinciAdimKurYanitSema },
      },
    },
    async (request) => {
      const p = request.platform;
      if (!p) throw new AppError(401, errorCodes.unauthorized, 'Oturum açmanız gerekiyor.');
      const sir = yeniSir();
      const yedekKodlar = yedekKodlariUret();
      const yazildi = await platformIslem(request, (baglam) =>
        ikinciAdimKurSistem(kimlik.sistemDb, baglam, {
          id: uuidv7(),
          kullaniciId: p.kullaniciId,
          sirSifreli: kasa.sifrele(sir),
          yedekKodOzetleri: yedekKodlar.map((k) => kasa.yedekKodOzeti(k)),
        }),
      );
      if (!yazildi) {
        throw new AppError(
          409,
          errorCodes.ikinciAdimKurulu,
          'İki adımlı doğrulama zaten kurulu. Sıfırlamak için platform sorumlusuna başvurun.',
        );
      }
      return {
        otpauth_uri: otpauthUri(sir, `${p.rol}-${p.kullaniciId.slice(0, 8)}`),
        sir: base32Kodla(sir),
        yedek_kodlar: yedekKodlar,
      };
    },
  );

  app.post(
    '/ikinci-adim/onayla',
    {
      config: { platformEylem: 'platform.ikinci_adim_onayla', ...muaf },
      schema: {
        tags: tag,
        summary: 'Kurulumu ilk kodla onayla (oturumu da doğrulanmış sayar)',
        body: IkinciAdimKodGirdiSema,
        response: { 200: IkinciAdimYanitSema },
      },
    },
    async (request) => {
      const p = request.platform;
      const sid = request.auth?.sessionId;
      if (!p || !sid) throw new AppError(401, errorCodes.unauthorized, 'Oturum açmanız gerekiyor.');
      const sonuc = await ikinciAdimDegerlendir(
        kimlik.sistemDb,
        platformBaglami(request),
        { kullaniciId: p.kullaniciId, oturumId: sid, onayli: false },
        (satir) => {
          const sayac = totpDogrula(
            kasa.coz(satir.sir_sifreli),
            request.body.kod,
            new Date(),
            satir.son_sayac,
          );
          return sayac === null
            ? { sonuc: 'yanlis' }
            : { sonuc: 'dogru', guncelle: { sonSayac: sayac, onayla: true } };
        },
      );
      hataFirlat(sonuc);
      return {
        dogrulandi: true as const,
        yedek_kod_kalan: sonuc.durum === 'dogrulandi' ? sonuc.yedekKodKalan : 0,
      };
    },
  );

  app.post(
    '/ikinci-adim/dogrula',
    {
      config: { platformEylem: 'platform.ikinci_adim_dogrula', ...muaf },
      schema: {
        tags: tag,
        summary: 'Oturumu ikinci adım koduyla (veya yedek kodla) doğrula',
        description:
          'Başarılı doğrulama oturuma bağlanır ve `PLATFORM_IKINCI_ADIM_OMRU_SN` boyunca `/platform/*` açılır. 5 yanlış denemede 15 dakika kilit (429). Aynı TOTP kodu iki kez kullanılamaz. Yedek kod tek kullanımlıktır.',
        body: IkinciAdimDogrulaGirdiSema,
        response: { 200: IkinciAdimYanitSema },
      },
    },
    async (request) => {
      const p = request.platform;
      const sid = request.auth?.sessionId;
      if (!p || !sid) throw new AppError(401, errorCodes.unauthorized, 'Oturum açmanız gerekiyor.');
      const { kod, yedek_kod: yedekKod } = request.body;
      const sonuc = await ikinciAdimDegerlendir(
        kimlik.sistemDb,
        platformBaglami(request),
        { kullaniciId: p.kullaniciId, oturumId: sid, onayli: true },
        (satir) => {
          if (kod !== undefined) {
            const sayac = totpDogrula(
              kasa.coz(satir.sir_sifreli),
              kod,
              new Date(),
              satir.son_sayac,
            );
            return sayac === null
              ? { sonuc: 'yanlis' }
              : { sonuc: 'dogru', guncelle: { sonSayac: sayac } };
          }
          const ozet = kasa.yedekKodOzeti(yedekKodunuNormallestir(yedekKod ?? ''));
          if (!satir.yedek_kod_ozetleri.includes(ozet)) return { sonuc: 'yanlis' };
          return {
            sonuc: 'dogru',
            guncelle: { yedekKodOzetleri: satir.yedek_kod_ozetleri.filter((o) => o !== ozet) },
          };
        },
      );
      if (sonuc.durum === 'kurulu_degil') {
        throw new AppError(
          409,
          errorCodes.conflict,
          'İki adımlı doğrulama kurulu değil; önce kurulumu tamamlayın.',
        );
      }
      // Basarisiz denemeler denetimde gorunur (basari satiri `onSend`te yazilir).
      if (sonuc.durum !== 'dogrulandi') {
        await platformDenetimYaz(kimlik.sistemDb, {
          ...platformBaglami(request, { eylem: 'platform.ikinci_adim_basarisiz' }),
          ayrinti: { sonuc: sonuc.durum, yontem: kod !== undefined ? 'totp' : 'yedek_kod' },
        });
      }
      hataFirlat(sonuc);
      return {
        dogrulandi: true as const,
        yedek_kod_kalan: sonuc.durum === 'dogrulandi' ? sonuc.yedekKodKalan : 0,
      };
    },
  );
  return Promise.resolve();
};
