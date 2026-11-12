import type { NextRequest, NextResponse } from 'next/server';

import { motivasyonMock } from './motivasyon-mock';
import { servisVekili, yolIzinliMi as ortakYolIzinliMi, type VekilTanimi } from './vekil';

/**
 * `/api/motivasyon/<yol>` -> `motivasyon` servisinin `/v1/motivasyon/<yol>` ucu: ogrenci durumu, seri,
 * odak oturumlari, karakter ve kozmetik, haftanin yildizi ve ogretmen seri duraklatmasi. Yalniz asagidaki
 * yollar (tam eslesme) gecer; Bearer belirtec aynen iletilir.
 */
const K = String.raw`kurumlar\/[^/]+`;
export const MOTIVASYON_IZINLI_YOLLAR: readonly RegExp[] = [
  // Ogrencinin kendi durumu ve seri takvimi
  new RegExp(`^${K}\\/benim$`),
  new RegExp(`^${K}\\/benim\\/seri$`),
  // Ogretmen/yonetici: ogrenci ozeti ve aldigi yildizlar
  new RegExp(`^${K}\\/ogrenciler\\/[^/]+\\/(ozet|haftanin-yildizlari)$`),
  // Odak oturumlari
  new RegExp(`^${K}\\/odak-oturumlari$`),
  new RegExp(`^${K}\\/odak-oturumlari\\/acik$`),
  new RegExp(`^${K}\\/odak-oturumlari\\/[^/]+\\/bitir$`),
  // Haftanin yildizi (ver, verdiklerim)
  new RegExp(`^${K}\\/haftanin-yildizlari$`),
  new RegExp(`^${K}\\/haftanin-yildizlari\\/verdiklerim$`),
  // Karakter ve kozmetik
  new RegExp(`^${K}\\/karakter$`),
  new RegExp(`^${K}\\/karakter\\/(turler|tur|ad|kozmetikler)$`),
  new RegExp(`^${K}\\/karakter\\/kusanimlar\\/[^/]+$`),
  // Grup seri duraklatmalari
  new RegExp(`^${K}\\/gruplar\\/[^/]+\\/seri-duraklatmalari$`),
  new RegExp(`^${K}\\/gruplar\\/[^/]+\\/seri-duraklatmalari\\/[^/]+$`),
];

/** Motivasyon servisinin taban adresi; gelistirmede `http://localhost:4001`. */
export const motivasyonAdresi = (): string => process.env.MOTIVASYON_URL ?? 'http://localhost:4001';

export function motivasyonYoluIzinliMi(parcalar: readonly string[], yontem = 'GET'): boolean {
  return ortakYolIzinliMi(parcalar, MOTIVASYON_IZINLI_YOLLAR, yontem);
}

const tanim: VekilTanimi = {
  servis: 'motivasyon',
  izinli: MOTIVASYON_IZINLI_YOLLAR,
  mock: motivasyonMock,
  hedef: (yol) => `${motivasyonAdresi()}/v1/motivasyon/${yol}`,
};

export function motivasyonVekili(
  request: NextRequest,
  parcalar: readonly string[],
): Promise<NextResponse> {
  return servisVekili(tanim, request, parcalar);
}
