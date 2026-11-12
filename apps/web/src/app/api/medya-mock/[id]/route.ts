import { NextResponse, type NextRequest } from 'next/server';

import { mockModu } from '@/sunucu/kimlik';
import { medyaMockOku, medyaMockYaz } from '@/sunucu/medya-mock';

interface Baglam {
  params: Promise<{ id: string }>;
}

/**
 * Mock modunda presigned PUT/GET adresinin karsiligi (gercek depolama yerine bellek). Gercek modda
 * bu yol 404 verir; baytlar yalniz tarayici ile depolama arasinda gider.
 */
export async function PUT(request: NextRequest, { params }: Baglam) {
  if (!mockModu()) return new NextResponse(null, { status: 404 });
  const { id } = await params;
  const bayt = new Uint8Array(await request.arrayBuffer());
  const tur = request.headers.get('content-type') ?? 'application/octet-stream';
  return new NextResponse(null, { status: medyaMockYaz(id, bayt, tur) ? 200 : 404 });
}

export async function GET(_request: NextRequest, { params }: Baglam) {
  if (!mockModu()) return new NextResponse(null, { status: 404 });
  const { id } = await params;
  const dosya = medyaMockOku(id);
  if (!dosya) return new NextResponse(null, { status: 404 });
  return new NextResponse(dosya.bayt as BodyInit, {
    headers: { 'content-type': dosya.tur, 'cache-control': 'no-store' },
  });
}
