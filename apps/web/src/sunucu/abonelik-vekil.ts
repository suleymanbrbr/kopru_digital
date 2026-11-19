import type { NextRequest, NextResponse } from 'next/server';

import { abonelikMock } from './abonelik-mock';
import { servisVekili, yolIzinliMi as ortakYolIzinliMi, type VekilTanimi } from './vekil';

/**
 * `/api/abonelik/<yol>` -> `api` servisinin `/v1/abonelik/<yol>` ucu (yalniz sahip uclari): planlar,
 * abonelik, fatura bilgileri, iptal, plan degistirme, odeme baslatma, odeme ve fatura gecmisi.
 * Webhook ve odeme donus uclari (`webhook/*`, `odeme/iyzico/donus`) saglayicilar icindir, tarayiciya acilmaz.
 */
export const ABONELIK_IZINLI_YOLLAR: readonly RegExp[] = [
  /^kurumlar\/[^/]+\/(planlar|abonelik|fatura-bilgileri|odemeler|faturalar)$/,
  /^kurumlar\/[^/]+\/abonelik\/(iptal|plan-degistir)$/,
  /^kurumlar\/[^/]+\/odeme\/baslat$/,
];

export function abonelikYoluIzinliMi(parcalar: readonly string[], yontem = 'GET'): boolean {
  return ortakYolIzinliMi(parcalar, ABONELIK_IZINLI_YOLLAR, yontem);
}

const tanim: VekilTanimi = {
  servis: 'abonelik',
  izinli: ABONELIK_IZINLI_YOLLAR,
  mock: abonelikMock,
};

export function abonelikVekili(
  request: NextRequest,
  parcalar: readonly string[],
): Promise<NextResponse> {
  return servisVekili(tanim, request, parcalar);
}
