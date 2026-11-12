import type { NextRequest, NextResponse } from 'next/server';

import { dersMock } from './ders-mock';
import { kayitMock } from './kayit-mock';
import {
  servisVekili,
  yolIzinliMi as ortakYolIzinliMi,
  type MockIstek,
  type VekilTanimi,
} from './vekil';

/**
 * `/api/ders/<yol>` -> `api` servisinin `/v1/ders/<yol>` ucu: takvim, ders islemleri, yoklama, ders
 * kayitlari/materyaller ve ders sonu geri bildirimi.
 */
export const DERS_IZINLI_YOLLAR: readonly RegExp[] = [
  // `dersler/{id}/kaynaklar` ve `dersler/{id}/geri-bildirim[ler]` da bu desenle gecer.
  /^kurumlar\/[^/]+\/(dersler|seriler)(\/|$)/,
  /^kurumlar\/[^/]+\/yoklama-bekleyen$/,
  // Ders kayitlari ve materyaller (personel) ile "Kayitlarim" (ogrenci).
  /^kurumlar\/[^/]+\/gruplar\/[^/]+\/materyaller$/,
  /^kurumlar\/[^/]+\/kaynaklar(\/[^/]+(\/(izlemeler|sorunlar|sorunlar\/coz))?)?$/,
  /^kurumlar\/[^/]+\/kayitlarim(\/[^/]+\/(izledim|sorunlar)|\/[^/]+)?$/,
  // Geri bildirim: bekleyenler, ozet ve ogrenci gecmisi (ders bazli uclar `dersler` altindadir).
  /^kurumlar\/[^/]+\/geri-bildirim\/(bekleyen|ozet)$/,
  /^kurumlar\/[^/]+\/ogrenciler\/[^/]+\/geri-bildirimler$/,
];

export function dersYoluIzinliMi(parcalar: readonly string[]): boolean {
  return ortakYolIzinliMi(parcalar, DERS_IZINLI_YOLLAR);
}

/** Once kayit/geri bildirim mock'u, ilgilenmezse takvim/yoklama mock'u. */
function mock(istek: MockIstek) {
  return kayitMock(istek) ?? dersMock(istek);
}

const tanim: VekilTanimi = { servis: 'ders', izinli: DERS_IZINLI_YOLLAR, mock };

export function dersVekili(
  request: NextRequest,
  parcalar: readonly string[],
): Promise<NextResponse> {
  return servisVekili(tanim, request, parcalar);
}
