import { defineModule } from '../define-module.js';
import { hesapYollari } from './hesap-yollari.js';
import { kimlikYollari } from './kimlik-yollari.js';

/**
 * hesap modulu: kimlik (Better Auth, JWT/JWKS), KVKK riza, kurum, uyelik, modul ayarlari.
 * Kimlik katmani (`createKimlik`) `app.kimlik` dekoratorunu kurar; DATABASE_URL yoksa rotalar kaydolmaz.
 */
export const hesapModule = defineModule(
  'hesap',
  async (app) => {
    if (app.hasDecorator('kimlik')) await app.register(hesapYollari);
  },
  {
    rootPlugin: async (app) => {
      if (app.hasDecorator('kimlik')) await app.register(kimlikYollari);
    },
  },
);

export {
  createKimlik,
  type KimlikHizmeti,
  type KimlikSecenekleri,
  type YetkiBaglami,
} from './kimlik.js';
export { modulAcikMi, type ModulBaglami } from './modul-ayarlari.js';
export {
  LogSmsGonderici,
  YakalayanSmsGonderici,
  type SmsGonderici,
  type SmsMesaji,
} from './sms.js';
export { requirePermission, type IzinSecenekleri } from './yetki.js';
