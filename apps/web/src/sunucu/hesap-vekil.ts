import type { NextRequest, NextResponse } from 'next/server';

import { hesapMock } from './hesap-mock';
import { servisVekili, yolIzinliMi as ortakYolIzinliMi, type VekilTanimi } from './vekil';

/**
 * `/api/hesap/<yol>` -> `api` servisinin `/v1/hesap/<yol>` ucu (kiraci uc noktalari icin ince gecit).
 * Kurum bilgisi (saat dilimi, ayarlar) yalniz okunabilir; kurum guncellemesi bu gecitten gecmez.
 */
export const HESAP_IZINLI_YOLLAR: readonly RegExp[] = [
  /^kurumlar\/[^/]+\/(gruplar|davetler|uyelikler|atamalar)(\/|$)/,
  /^davetler\/kabul$/,
  /^oturumlar(\/|$)/,
  /^sinif-kodu\/(katil|istekler)(\/|$)/,
];
const HESAP_YALNIZ_OKUMA: readonly RegExp[] = [/^kurumlar\/[^/]+$/];

export function yolIzinliMi(parcalar: readonly string[], yontem = 'GET'): boolean {
  return ortakYolIzinliMi(parcalar, HESAP_IZINLI_YOLLAR, yontem, HESAP_YALNIZ_OKUMA);
}

const tanim: VekilTanimi = {
  servis: 'hesap',
  izinli: HESAP_IZINLI_YOLLAR,
  yalnizOkuma: HESAP_YALNIZ_OKUMA,
  mock: hesapMock,
};

export function hesapVekili(
  request: NextRequest,
  parcalar: readonly string[],
): Promise<NextResponse> {
  return servisVekili(tanim, request, parcalar);
}
