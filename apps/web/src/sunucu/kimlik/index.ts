import { apiKimlik } from './api';
import type { KimlikAdaptoru } from './arayuz';
import { mockKimlik } from './mock';

export { KimlikHatasi } from './arayuz';
export type { KimlikAdaptoru } from './arayuz';

/** `NEXT_PUBLIC_API_MOCK=1` ise bellek ici mock, aksi halde `api` servisi. */
export const mockModu = (): boolean => process.env.NEXT_PUBLIC_API_MOCK === '1';

let onbellek: KimlikAdaptoru | undefined;

export function kimlik(): KimlikAdaptoru {
  onbellek ??= mockModu() ? mockKimlik() : apiKimlik();
  return onbellek;
}
