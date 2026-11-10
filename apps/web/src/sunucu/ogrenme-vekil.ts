import type { NextRequest, NextResponse } from 'next/server';

import { ogrenmeMock } from './ogrenme-mock';
import { servisVekili, yolIzinliMi as ortakYolIzinliMi, type VekilTanimi } from './vekil';

/**
 * `/api/ogrenme/<yol>` -> `api` servisinin `/v1/ogrenme/<yol>` ucu: mufredat, odev, haftalik plan ve
 * deneme. Deneme Excel sablonu indirme ve `.xlsx` yukleme ikili govdeyle gecer (`content-type` ve
 * `content-disposition` korunur).
 */
const K = String.raw`kurumlar\/[^/]+`;
export const OGRENME_IZINLI_YOLLAR: readonly RegExp[] = [
  // Mufredat
  new RegExp(`^${K}\\/(kataloglar|mufredat-atamalari)$`),
  new RegExp(`^${K}\\/konular(\\/|$)`),
  // Odev
  new RegExp(`^${K}\\/(odevler|odev-sablonlari|ogrenci-odevleri)(\\/|$)`),
  new RegExp(`^${K}\\/odevlerim$`),
  // Haftalik plan
  new RegExp(`^${K}\\/(planlar|plan-sablonlari|gorevler)(\\/|$)`),
  new RegExp(`^${K}\\/(planim|gorevlerim)$`),
  new RegExp(`^${K}\\/ogrenciler\\/[^/]+\\/(plan|deneme-gelisim)$`),
  // Deneme
  new RegExp(`^${K}\\/(denemeler|deneme-kurallari)(\\/|$)`),
  new RegExp(`^${K}\\/(denemelerim|deneme-ayarlari)$`),
  new RegExp(`^${K}\\/gruplar\\/[^/]+\\/deneme-ozet$`),
];

export function ogrenmeYoluIzinliMi(parcalar: readonly string[], yontem = 'GET'): boolean {
  return ortakYolIzinliMi(parcalar, OGRENME_IZINLI_YOLLAR, yontem);
}

const tanim: VekilTanimi = { servis: 'ogrenme', izinli: OGRENME_IZINLI_YOLLAR, mock: ogrenmeMock };

export function ogrenmeVekili(
  request: NextRequest,
  parcalar: readonly string[],
): Promise<NextResponse> {
  return servisVekili(tanim, request, parcalar);
}
