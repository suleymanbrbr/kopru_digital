import { AsyncLocalStorage } from 'node:async_hooks';

import type { FastifyInstance } from 'fastify';

interface IstekBaglami {
  saltOkunur: boolean;
}

const depo = new AsyncLocalStorage<IstekBaglami>();

/**
 * Her istek icin bir baglam acar (kok `onRequest` kancasi, callback bicimi: sonraki kancalar ve isleyici
 * ayni asenkron baglamda calisir). Yalniz `createService` kurar.
 */
export function installIstekBaglami(app: FastifyInstance): void {
  app.addHook('onRequest', (_request, _reply, done) => {
    depo.run({ saltOkunur: false }, done);
  });
}

/**
 * Gecerli istegi salt okunur isaretler (ADR 0004: taklit). Bundan sonra `withTenant` / `withUser`
 * her islemi `set transaction read only` ile baslatir; veritabani yazmayi reddeder. Istek baglami
 * yoksa (is/tuketici kodu) hicbir sey yapmaz.
 */
export function istegiSaltOkunurYap(): void {
  const baglam = depo.getStore();
  if (baglam) baglam.saltOkunur = true;
}

export const saltOkunurMu = (): boolean => depo.getStore()?.saltOkunur === true;

/** Test ve ozel durumlar icin: `fn` boyunca salt okunur baglam. */
export function saltOkunurCalistir<T>(fn: () => T): T {
  return depo.run({ saltOkunur: true }, fn);
}
