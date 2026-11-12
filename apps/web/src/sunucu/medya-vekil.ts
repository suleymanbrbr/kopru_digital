import type { NextRequest, NextResponse } from 'next/server';

import { medyaMock } from './medya-mock';
import { servisVekili, yolIzinliMi as ortakYolIzinliMi, type VekilTanimi } from './vekil';

/**
 * `/api/medya/<yol>` -> `medya` servisinin `/v1/<yol>` ucu (yukleme izni, tamamlama, durum). Dosya
 * baytlari BFF'den GECMEZ: tarayici presigned `PUT` ile dogrudan depolamaya yazar (kova CORS'u
 * `medya` servisinde `CORS_ORIGINS` ile ayarlanir). Bearer belirtec aynen iletilir.
 */
export const MEDYA_IZINLI_YOLLAR: readonly RegExp[] = [
  /^dosyalar$/,
  /^dosyalar\/[^/]+$/,
  /^dosyalar\/[^/]+\/tamam$/,
];

/** Medya servisinin taban adresi; gelistirmede `http://localhost:4003`. */
export const medyaAdresi = (): string => process.env.MEDYA_URL ?? 'http://localhost:4003';

export function medyaYoluIzinliMi(parcalar: readonly string[], yontem = 'GET'): boolean {
  return ortakYolIzinliMi(parcalar, MEDYA_IZINLI_YOLLAR, yontem);
}

const tanim: VekilTanimi = {
  servis: 'medya',
  izinli: MEDYA_IZINLI_YOLLAR,
  mock: medyaMock,
  hedef: (yol) => `${medyaAdresi()}/v1/${yol}`,
};

export function medyaVekili(
  request: NextRequest,
  parcalar: readonly string[],
): Promise<NextResponse> {
  return servisVekili(tanim, request, parcalar);
}
