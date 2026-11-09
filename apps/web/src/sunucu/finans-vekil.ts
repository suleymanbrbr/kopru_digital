import type { NextRequest, NextResponse } from 'next/server';

import { finansMock } from './finans-mock';
import { servisVekili, yolIzinliMi as ortakYolIzinliMi, type VekilTanimi } from './vekil';

/**
 * `/api/finans/<yol>` -> `api` servisinin `/v1/finans/<yol>` ucu: paketler, tahsilat, ogrenci karti,
 * tarifeler, ayarlar, aylik ozet ve `.xlsx` disa aktarimi (ikili yanit bozulmadan iletilir).
 */
export const FINANS_IZINLI_YOLLAR: readonly RegExp[] = [
  /^kurumlar\/[^/]+\/(paketler|paket-satislari|tahsilatlar|ogrenciler|ucret-tarifeleri)(\/|$)/,
  /^kurumlar\/[^/]+\/(kredi-politikasi|ayarlar|disa-aktar)$/,
  /^kurumlar\/[^/]+\/ozet\/aylik$/,
];

export function finansYoluIzinliMi(parcalar: readonly string[]): boolean {
  return ortakYolIzinliMi(parcalar, FINANS_IZINLI_YOLLAR);
}

const tanim: VekilTanimi = { servis: 'finans', izinli: FINANS_IZINLI_YOLLAR, mock: finansMock };

export function finansVekili(
  request: NextRequest,
  parcalar: readonly string[],
): Promise<NextResponse> {
  return servisVekili(tanim, request, parcalar);
}
