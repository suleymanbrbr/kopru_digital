import { NextResponse, type NextRequest } from 'next/server';

import { ayniKaynakMi, cerezSil, hataYaniti, oturumBelirteci } from '@/sunucu/bff';
import { kimlik } from '@/sunucu/kimlik';

export async function POST(request: NextRequest) {
  if (!ayniKaynakMi(request)) return hataYaniti('yasak', 'İstek kaynağı geçersiz.', 403);
  const belirtec = oturumBelirteci(request);
  if (belirtec)
    await kimlik()
      .cikis(belirtec)
      .catch(() => undefined);
  const yanit = new NextResponse(null, { status: 204 });
  cerezSil(yanit);
  return yanit;
}
