import { NextResponse, type NextRequest } from 'next/server';

import { platformMesajiMock } from '@/sunucu/abonelik-mock';
import { mockModu } from '@/sunucu/kimlik';
import { apiAdresi } from '@/sunucu/kimlik/api';

/** Kimliksiz platform bakim/duyuru mesaji: `GET /v1/platform-mesaji` (giris ekraninda da gorunur). */
export async function GET(request: NextRequest) {
  if (mockModu()) {
    return NextResponse.json(
      platformMesajiMock(request.cookies.get('mock_platform_mesaji')?.value),
      { headers: { 'cache-control': 'no-store' } },
    );
  }
  try {
    const yanit = await fetch(`${apiAdresi()}/v1/platform-mesaji`, { cache: 'no-store' });
    if (!yanit.ok) return NextResponse.json({ mesaj: null });
    return NextResponse.json(await yanit.json(), { headers: { 'cache-control': 'no-store' } });
  } catch {
    // Mesaj servisi yoksa uygulama calismaya devam eder.
    return NextResponse.json({ mesaj: null });
  }
}
