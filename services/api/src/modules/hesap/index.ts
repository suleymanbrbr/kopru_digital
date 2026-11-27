import { defineModule } from '../define-module.js';
import { davetYollari } from './davet-yollari.js';
import { grupYollari } from './grup-yollari.js';
import { hesapYollari } from './hesap-yollari.js';
import { kimlikYollari } from './kimlik-yollari.js';
import { kvkkYollari } from './kvkk-yollari.js';
import { oturumYollari } from './oturum-yollari.js';
import { platformYollari } from './platform/index.js';
import { raporYollari } from './rapor.js';
import { sinifKatilimKullaniciYollari } from './sinif-katilim-kullanici-yollari.js';
import { sinifKatilimYollari } from './sinif-katilim-yollari.js';

/**
 * hesap modulu: kimlik (Better Auth, JWT/JWKS), KVKK riza, kurum, uyelik, modul ayarlari.
 * Kimlik katmani (`createKimlik`) `app.kimlik` dekoratorunu kurar; DATABASE_URL yoksa rotalar kaydolmaz.
 */
export const hesapModule = defineModule(
  'hesap',
  async (app) => {
    if (app.hasDecorator('kimlik')) {
      await app.register(hesapYollari);
      await app.register(grupYollari);
      await app.register(davetYollari());
      await app.register(oturumYollari);
      await app.register(kvkkYollari);
      await app.register(raporYollari);
      await app.register(sinifKatilimYollari);
      await app.register(sinifKatilimKullaniciYollari);
    }
  },
  {
    rootPlugin: async (app) => {
      if (app.hasDecorator('kimlik')) {
        await app.register(kimlikYollari);
        // /platform/* ve kimliksiz GET /v1/platform-mesaji (ADR 0004 "Platform yoneticisi ve taklit").
        await app.register(platformYollari);
      }
    },
  },
);

export {
  createKimlik,
  type KimlikHizmeti,
  type KimlikSecenekleri,
  type YetkiBaglami,
} from './kimlik.js';
export { servisBelirteciUret, type ServisBelirteciIstegi } from './servis-belirteci.js';
// Gelistirme araclari (scripts/platform-belirteci.ts): JWT imza anahtari deposu ve audience.
export { AnahtarDeposu } from './anahtarlar.js';
export { JWT_AUDIENCE } from './erisim-belirteci.js';
export { modulAcikMi, type ModulBaglami } from './modul-ayarlari.js';
export {
  LogSmsGonderici,
  YakalayanSmsGonderici,
  type SmsGonderici,
  type SmsMesaji,
} from './sms.js';
export { telefonuNormallestir } from './telefon.js';
// P1 kapisi ve denetim yardimcisi: baska modullerin `/platform/*` uclari (mufredat editoru) bunu kullanir.
export { platformKapisiKur } from './platform/kapi.js';
export {
  denetimAlanlari,
  platformBaglami,
  platformIslem,
  type PlatformKimligi,
} from './platform/ortak.js';
// Platform 2FA (testler ve betikler icin TOTP yardimcilari).
export { base32Coz, sayacHesapla, totpKodu } from './platform/totp.js';
export { requirePermission, type IzinSecenekleri } from './yetki.js';
export {
  LogEpostaGonderici,
  SmtpEpostaGonderici,
  YakalayanEpostaGonderici,
  type EpostaGonderici,
  type EpostaMesaji,
} from './eposta.js';
export { birebirGrupOlustur, birebirOgrenciAdlari, grupEtkinOgrencileri } from './grup-deposu.js';
export { gorunenAdlar, grupOlayVerisi, grupUyesiOlayVerisi } from './grup-deposu.js';
export {
  atananGruplar,
  grupKapsami,
  kapsamdakiGruplar,
  kapsamdakiOgrenciler,
  uyeOlunanGruplar,
} from './kapsam.js';
export { donemAlani, hesapRaporOzeti, raporDonemi, type RaporDonemBilgisi } from './rapor.js';
