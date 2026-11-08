import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { govdeOku, hataYaniti } from '@/sunucu/bff';
import { mockModu } from '@/sunucu/kimlik';
import { apiAdresi } from '@/sunucu/kimlik/api';

const govdeSema = z.object({ eposta: z.email() });

/** Dogrulama baglantisini yeniden yollar. Yanit her zaman ayni (kullanici durumu ifsa edilmez). */
export async function POST(request: NextRequest) {
  const govde = await govdeOku(request, govdeSema);
  if ('yanit' in govde) return govde.yanit;
  if (mockModu()) return NextResponse.json({ gonderildi: true });
  try {
    const yanit = await fetch(`${apiAdresi()}/auth/eposta/dogrulama-gonder`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eposta: govde.veri.eposta }),
      cache: 'no-store',
    });
    return new NextResponse(await yanit.text(), {
      status: yanit.status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch {
    return hataYaniti('hizmet_kullanilamiyor', 'Sunucuya ulaşılamadı.', 502);
  }
}
