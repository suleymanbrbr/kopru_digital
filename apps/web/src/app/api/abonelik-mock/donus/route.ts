import { NextResponse, type NextRequest } from 'next/server';

import { mockOdemeDonusu } from '@/sunucu/abonelik-mock';
import { mockModu } from '@/sunucu/kimlik';

/**
 * Yalniz mock modu: sahte odeme sayfasi donusu. Gercek `api` iyzico donusunu isleyip
 * `${WEB_URL}/abonelik?odeme=<sonuc>` adresine 303 ile yonlendirir; mock ayni sozlesmeyi taklit eder.
 */
export function GET(request: NextRequest) {
  if (!mockModu()) return new NextResponse(null, { status: 404 });
  const sonuc = mockOdemeDonusu(
    request.cookies.get('mock_senaryo')?.value,
    request.nextUrl.searchParams.get('sonuc') ?? 'basarili',
  );
  return NextResponse.redirect(new URL(`/abonelik?odeme=${sonuc}`, request.nextUrl.origin), 303);
}
