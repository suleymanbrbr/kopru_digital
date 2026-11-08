import { NextResponse, type NextRequest } from 'next/server';

import { hataYaniti } from '@/sunucu/bff';
import { istemciIpBasliklari } from '@/sunucu/istemci-ip';
import { mockModu } from '@/sunucu/kimlik';
import { apiAdresi } from '@/sunucu/kimlik/api';

/** Mock modda gecerli sayilan dogrulama belirteci. */
const MOCK_EPOSTA_BELIRTECI = 'gecerli-eposta-belirteci';

/**
 * E-posta dogrulama sayfasinin cagirdigi herkese acik uc: belirteci `api`nin
 * `GET /auth/eposta/dogrula` ucuna iletir. Belirtec loga yazilmaz.
 */
export async function GET(request: NextRequest) {
  const belirtec = request.nextUrl.searchParams.get('belirtec');
  if (!belirtec || belirtec.length < 10 || belirtec.length > 512) {
    return hataYaniti('kod_gecersiz', 'Bağlantı geçersiz veya süresi dolmuş.', 400);
  }
  if (mockModu()) {
    return belirtec === MOCK_EPOSTA_BELIRTECI
      ? NextResponse.json({ dogrulandi: true })
      : hataYaniti('kod_gecersiz', 'Bağlantı geçersiz veya süresi dolmuş.', 400);
  }
  try {
    const yanit = await fetch(
      `${apiAdresi()}/auth/eposta/dogrula?belirtec=${encodeURIComponent(belirtec)}`,
      { cache: 'no-store', headers: istemciIpBasliklari(request.headers) },
    );
    return new NextResponse(await yanit.text(), {
      status: yanit.status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch {
    return hataYaniti('hizmet_kullanilamiyor', 'Sunucuya ulaşılamadı.', 502);
  }
}
