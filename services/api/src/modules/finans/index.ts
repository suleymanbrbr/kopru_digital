import { defineModule } from '../define-module.js';
import { ayarYollari } from './ayar.js';
import { ogrenciYollari } from './ogrenci.js';
import { paketYollari } from './paket.js';
import { raporYollari } from './rapor.js';
import { tahsilatYollari } from './tahsilat.js';

/**
 * finans modulu: paket sablonlari ve satisi, kredi defteri, ucret tarifeleri, tahsilat, ogrenci
 * bakiyesi, aylik ozet ve Excel disa aktarim (`/v1/finans/kurumlar/:kurum_id/...`). Kimlik katmani
 * (`app.kimlik`) yoksa rotalar kaydolmaz. Modul kurum/kademe/grup duzeyinde kapatilirsa uclar
 * `modul_kapali` doner ve `krediVeUcretiUygula` etkisizdir.
 */
export const finansModule = defineModule('finans', async (app) => {
  if (!app.hasDecorator('kimlik')) return;
  await app.register(paketYollari);
  await app.register(tahsilatYollari);
  await app.register(ogrenciYollari);
  await app.register(ayarYollari);
  await app.register(raporYollari);
});

// Yoklama (ders modulu) ve gece isleri icin dis yuzey.
export {
  dersIptalUygula,
  durumDusurur,
  gecIptalSaatiBul,
  krediVeUcretiUygula,
  kurumPolitikasiGetir,
  politikaCoz,
  VARSAYILAN_POLITIKA,
  type DersIptalUygulaGirdi,
  type FinansUygulaSonucu,
  type KrediAzaldiBilgisi,
  type KrediPolitikasi,
  type KrediVeUcretiUygulaGirdi,
  type YoklamaDurumu,
} from './kredi-uygula.js';
export {
  geceIsiZamanla,
  geceIsleriniCalistir,
  ozetDenetimiCalistir,
  sonKullanmaCalistir,
  type GeceIsiGunlugu,
  type OzetUyusmazligi,
} from './gece-isi.js';
