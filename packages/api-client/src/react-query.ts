import type { Client } from 'openapi-fetch';
import createQueryClient from 'openapi-react-query';

import type { ServisIstemcileri } from './istemci.js';

/**
 * Bir servis istemcisini TanStack Query yardimcilarina (`useQuery`, `useMutation`,
 * `queryOptions`) cevirir. Tipler servisin OpenAPI sozlesmesinden gelir.
 *
 *   const sorgu = createQueryHelpers(istemciler.api);
 *   const { data } = sorgu.useQuery('get', '/v1/ornek');
 */
export function createQueryHelpers<P extends object>(client: Client<P>) {
  return createQueryClient(client);
}

/** Dort servis icin yardimcilar. */
export function createServisSorgulari(istemciler: ServisIstemcileri) {
  return {
    api: createQueryHelpers(istemciler.api),
    motivasyon: createQueryHelpers(istemciler.motivasyon),
    bildirim: createQueryHelpers(istemciler.bildirim),
    medya: createQueryHelpers(istemciler.medya),
  };
}
