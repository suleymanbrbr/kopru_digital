import { NextResponse, type NextRequest } from 'next/server';

import { mockModu } from '@/sunucu/api';
import { hataYaniti } from '@/sunucu/bff';
import { durumuSifirla } from '@/sunucu/mock';

/** Yalniz mock modunda: e2e testleri arasinda paylasimli bellek durumunu basa alir. */
export function POST(_request: NextRequest) {
  if (!mockModu()) return hataYaniti('bulunamadi', 'Kaynak bulunamadı.', 404);
  durumuSifirla();
  return NextResponse.json({ ok: true });
}
