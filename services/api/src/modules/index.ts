import type { ServicePlugin } from '@kopru/service-kit';

import { abonelikModule } from './abonelik/index.js';
import type { ApiModule } from './define-module.js';
import { dersModule } from './ders/index.js';
import { finansModule } from './finans/index.js';
import { hesapModule } from './hesap/index.js';
import { ogrenmeModule } from './ogrenme/index.js';

export const modules: readonly ApiModule[] = [
  hesapModule,
  dersModule,
  finansModule,
  ogrenmeModule,
  abonelikModule,
];

/** Tum modulleri `/v1/<modul>` onekiyle kaydeder. */
export const modulesPlugin: ServicePlugin = async (app) => {
  for (const mod of modules) {
    await app.register(mod.plugin, { prefix: mod.prefix });
  }
};
