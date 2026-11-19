import type { ServicePlugin } from '@kopru/service-kit';

import { cihazYollari } from './cihaz-yollari.js';
import { duyuruYollari } from './duyuru-yollari.js';
import { kutuYollari } from './kutu-yollari.js';
import { kvkkYollari } from './kvkk-yollari.js';
import { tercihYollari } from './tercih-yollari.js';

export interface YolSecenekleri {
  /** Testler icin saat. */
  simdi?: () => Date;
}

/**
 * Kullanici uclari (`/v1/bildirim/...`): cihaz kaydi, gelen kutusu, tercihler ve ayarlar. Gelen kutusu
 * yalniz istegi yapanin o kurumdaki uyeligine aittir (`alici_id = uyelik_id`); baska kullanicinin
 * bildirimine erisim yoktur (404).
 */
export function yollariOlustur(secenek: YolSecenekleri = {}): ServicePlugin {
  const simdi = secenek.simdi ?? (() => new Date());
  return async (app) => {
    if (!app.db) return;
    await app.register(cihazYollari({ simdi }));
    await app.register(kutuYollari({ simdi }));
    await app.register(tercihYollari());
    await app.register(duyuruYollari({ simdi }));
    await app.register(kvkkYollari);
  };
}
