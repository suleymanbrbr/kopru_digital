import { defineModule } from '../define-module.js';
import { odemeYollari } from './odeme-yollari.js';
import { webhookYollari } from './webhook-yollari.js';
import { abonelikYollari } from './yollar.js';

/**
 * abonelik modulu: plan katalogu, kurum abonelikleri (deneme, aktif, ek sure, askida), plan limitleri ve
 * sahip uc noktalari (`/v1/abonelik/kurumlar/:kurum_id/...`), odeme saglayicilari (iyzico web odemesi,
 * RevenueCat magaza webhook'u), cift kanal engeli ve e-Arsiv fatura isi. Kimlik katmani (`app.kimlik`) yoksa
 * rotalar kaydolmaz.
 */
export const abonelikModule = defineModule('abonelik', async (app) => {
  if (!app.hasDecorator('kimlik')) return;
  await app.register(abonelikYollari);
  // Odeme kanallari (`odemeKanallariPlugin`) tanimliysa: odeme baslatma/gecmis ve webhook/donus uclari.
  if (app.hasDecorator('abonelikOdeme')) {
    await app.register(odemeYollari);
    await app.register(webhookYollari);
  }
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
// Platform paneli (`/platform/kurumlar/:id/abonelik`): okuma ve duzeltme eylemleri.
export {
  kurumsalAktivasyonIslemi,
  platformAbonelikDetayi,
  platformAbonelikEylemi,
  platformAbonelikOku,
  platformAbonelikOzeti,
  platformAboneligiAskiyaAl,
  platformAboneligiIptalEt,
  platformDenemeyiUzat,
  platformEkSureVer,
  platformPlanDegistir,
  type PlatformAbonelikEylemSonucu,
} from './platform.js';
export type { AbonelikVePlan } from './abonelik-deposu.js';
export { gecisZinciri, sonrakiGecis, type Gecis, type GecisGirdisi } from './durum-makinesi.js';
export {
  abonelikGecisIsiZamanla,
  abonelikGecisleriCalistir,
  type GecisIsiGunlugu,
} from './gecis-isi.js';
export {
  odemeKanallariOlustur,
  odemeKanallariPlugin,
  type OdemeEnv,
  type OdemeGunlugu,
  type OdemeKanallari,
} from './odeme-kanallari.js';
export { odemeIsiZamanla, odemeIsleriniCalistir, ODEME_ISI_ARALIGI_MS } from './odeme-isi.js';
export { bekleyenOlaylariIsle, olayiIsle } from './odeme-isleme.js';
export { faturalariKes, type FaturaIsiOzeti } from './fatura-isi.js';
export {
  LogEArsivSaglayici,
  type EArsivSaglayici,
  type FaturaKesGirdisi,
  type FaturaKesSonucu,
} from './earsiv.js';
export { IyzicoSaglayici, IYZICO_PROTOKOL } from './iyzico.js';
export { RevenueCatSaglayici, REVENUECAT_PROTOKOL } from './revenuecat.js';
export { kdvAyir, kdvEkle } from './kdv.js';
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
