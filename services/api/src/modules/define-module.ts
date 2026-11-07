import type { ServicePlugin } from '@kopru/service-kit';

/** Bir api modulu: `/v1/<ad>` onekiyle kaydedilen kapsullenmis Fastify plugin'i. */
export interface ApiModule {
  name: string;
  prefix: string;
  plugin: ServicePlugin;
}

const empty: ServicePlugin = () => Promise.resolve();

/**
 * Modul sozlesmesi: her modulun `index.ts` dosyasi modulun TEK acik yuzeyidir.
 * Baska moduller ve servis kodu yalnizca bu dosyayi import edebilir (ESLint zorlar).
 * Rotalar eklendiginde: `defineModule('ders', dersRoutes)`.
 */
export function defineModule(name: string, plugin: ServicePlugin = empty): ApiModule {
  return { name, prefix: `/v1/${name}`, plugin };
}
