import type { NextRequest, NextResponse } from 'next/server';

import { bildirimMock } from './bildirim-mock';
import { servisVekili, yolIzinliMi as ortakYolIzinliMi, type VekilTanimi } from './vekil';

/**
 * `/api/bildirim/<yol>` -> `bildirim` servisinin `/v1/bildirim/<yol>` ucu: cihaz kaydi, gelen kutusu,
 * tercih matrisi ve ayarlar. Yalniz asagidaki yollar (tam eslesme) gecer; Bearer belirtec aynen iletilir.
 */
const K = String.raw`kurumlar\/[^/]+`;
export const BILDIRIM_IZINLI_YOLLAR: readonly RegExp[] = [
  // Push cihazi (kullanici duzeyi)
  new RegExp(`^cihazlar$`),
  new RegExp(`^cihazlar\\/[^/]+$`),
  // Gelen kutusu
  new RegExp(`^${K}\\/kutu$`),
  new RegExp(`^${K}\\/kutu\\/(okunmamis-sayisi|tumunu-oku)$`),
  new RegExp(`^${K}\\/kutu\\/[^/]+\\/(okundu|arsivle)$`),
  // Tercihler ve ayarlar
  new RegExp(`^${K}\\/(tercihler|ayarlar)$`),
];

/** Bildirim servisinin taban adresi; gelistirmede `http://localhost:4002`. */
export const bildirimAdresi = (): string => process.env.BILDIRIM_URL ?? 'http://localhost:4002';

export function bildirimYoluIzinliMi(parcalar: readonly string[], yontem = 'GET'): boolean {
  return ortakYolIzinliMi(parcalar, BILDIRIM_IZINLI_YOLLAR, yontem);
}

const tanim: VekilTanimi = {
  servis: 'bildirim',
  izinli: BILDIRIM_IZINLI_YOLLAR,
  mock: bildirimMock,
  hedef: (yol) => `${bildirimAdresi()}/v1/bildirim/${yol}`,
};

export function bildirimVekili(
  request: NextRequest,
  parcalar: readonly string[],
): Promise<NextResponse> {
  return servisVekili(tanim, request, parcalar);
}
