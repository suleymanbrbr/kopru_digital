import type { NextRequest, NextResponse } from 'next/server';

import { dersMock } from './ders-mock';
import { servisVekili, yolIzinliMi as ortakYolIzinliMi, type VekilTanimi } from './vekil';

/** `/api/ders/<yol>` -> `api` servisinin `/v1/ders/<yol>` ucu: takvim, ders islemleri ve yoklama. */
export const DERS_IZINLI_YOLLAR: readonly RegExp[] = [
  /^kurumlar\/[^/]+\/(dersler|seriler)(\/|$)/,
  /^kurumlar\/[^/]+\/yoklama-bekleyen$/,
];

export function dersYoluIzinliMi(parcalar: readonly string[]): boolean {
  return ortakYolIzinliMi(parcalar, DERS_IZINLI_YOLLAR);
}

const tanim: VekilTanimi = { servis: 'ders', izinli: DERS_IZINLI_YOLLAR, mock: dersMock };

export function dersVekili(
  request: NextRequest,
  parcalar: readonly string[],
): Promise<NextResponse> {
  return servisVekili(tanim, request, parcalar);
}
