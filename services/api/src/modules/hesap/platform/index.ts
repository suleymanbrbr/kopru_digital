import type { ServicePlugin } from '@kopru/service-kit';

import {
  platformDenetimSaglikMesajYollari,
  platformMesajiAcikYol,
} from './denetim-saglik-mesaj-yollari.js';
import { ikinciAdimYollari } from './ikinci-adim-yollari.js';
import { platformKapisiKur } from './kapi.js';
import { platformKurumYollari } from './kurum-yollari.js';
import { taklitYollari } from './taklit-yollari.js';

/**
 * `/platform/*` (ADR 0004): `plat` claim'i + veritabaninda aktif platform rolu + ikinci adim + IP izin listesi.
 * Kapi ve denetim kancalari bu kapsullenmis plugin'e aittir; rota dosyalari yalniz is mantigini kaydeder.
 */
export const platformYollari: ServicePlugin = async (app) => {
  await app.register(
    async (platform) => {
      platformKapisiKur(platform, platform.kimlik);
      await platform.register(ikinciAdimYollari);
      await platform.register(platformKurumYollari);
      await platform.register(taklitYollari);
      await platform.register(platformDenetimSaglikMesajYollari);
    },
    { prefix: '/platform' },
  );
  await app.register(platformMesajiAcikYol);
};
