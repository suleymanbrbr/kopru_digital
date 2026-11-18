import { defineModule } from '../define-module.js';
import { abonelikYollari } from './yollar.js';

/**
 * abonelik modulu: plan katalogu, kurum abonelikleri (deneme, aktif, ek sure, askida), plan limitleri ve
 * sahip uc noktalari (`/v1/abonelik/kurumlar/:kurum_id/...`). Odeme saglayicilari (iyzico, RevenueCat) ve
 * e-Arsiv sonraki pakettedir; `OdemeSaglayici` arayuzu hazirdir. Kimlik katmani (`app.kimlik`) yoksa
 * rotalar kaydolmaz.
 */
export const abonelikModule = defineModule('abonelik', async (app) => {
  if (!app.hasDecorator('kimlik')) return;
  await app.register(abonelikYollari);
});

// hesap modulu: kurum olusturmada deneme, kontrol sirasi adim 4 (402) ve uye eklemede plan limiti.
export {
  abonelikGerekli,
  gecerliLimitler,
  kullanimSayilari,
  planAylikUstSiniri,
  planLimitiHatasi,
  planLimitiniDenetle,
  yazmaKapisi,
  yazmaKilitliMi,
} from './abonelik-deposu.js';
export { denemeBaslat, type DenemeBaslatGirdisi } from './yazma.js';

// Platform paneli ve odeme saglayicisi paketi icin dis yuzey.
export {
  aboneligiAktiflestir,
  gecisleriUygula,
  kurumDurumunuEsitle,
  planDegistirIstegi,
  yenilemeyiIptalEt,
  type AktiflestirGirdisi,
  type GecisOzeti,
  type OlayBaglami,
} from './yazma.js';
export { kurumsalAboneligiAktiflestir, type KurumsalAktivasyonGirdisi } from './kurumsal.js';
export { gecisZinciri, sonrakiGecis, type Gecis, type GecisGirdisi } from './durum-makinesi.js';
export {
  abonelikGecisIsiZamanla,
  abonelikGecisleriCalistir,
  type GecisIsiGunlugu,
} from './gecis-isi.js';
export {
  SahteOdemeSaglayici,
  type AyristirilmisWebhook,
  type OdemeBaslatGirdisi,
  type OdemeBaslatSonucu,
  type OdemeKaynagi,
  type OdemeSaglayici,
  type WebhookBasliklari,
} from './saglayici.js';
export {
  ASKIDAN_SONA_ERME_GUN,
  DENEME_GUN,
  EK_SURE_GUN,
  ETKIN_DURUMLAR,
  KILIT_DURUMLARI,
  UCRETSIZ_KATMAN,
} from './ortak.js';
