import { NextResponse, type NextRequest } from 'next/server';

import { oturumuKapat } from '@/sunucu/api';
import {
  ayniKaynakMi,
  cerez,
  cerezSil,
  ERISIM_CEREZI,
  hataYaniti,
  OTURUM_CEREZI,
  TAKLIT_CEREZI,
} from '@/sunucu/bff';

export async function POST(request: NextRequest) {
  if (!ayniKaynakMi(request)) return hataYaniti('yasak', 'İstek kaynağı geçersiz.', 403);
  const oturum = cerez(request, OTURUM_CEREZI);
  if (oturum) await oturumuKapat(oturum, request.headers);
  const cevap = NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  cerezSil(cevap, OTURUM_CEREZI, ERISIM_CEREZI, TAKLIT_CEREZI);
  return cevap;
}
