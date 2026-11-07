import { NextResponse, type NextRequest } from 'next/server';

import { rizaKabulGovdeSema } from '@/oturum/tipler';
import { cerezYaz, govdeOku, hatayiCevir, oturumGerekli } from '@/sunucu/bff';
import { kimlik } from '@/sunucu/kimlik';

export async function GET(request: NextRequest) {
  const oturum = oturumGerekli(request);
  if ('yanit' in oturum) return oturum.yanit;
  try {
    return NextResponse.json(await kimlik().rizaMetni(oturum.belirtec));
  } catch (hata) {
    return hatayiCevir(hata);
  }
}

export async function POST(request: NextRequest) {
  const govde = await govdeOku(request, rizaKabulGovdeSema);
  if ('yanit' in govde) return govde.yanit;
  const oturum = oturumGerekli(request);
  if ('yanit' in oturum) return oturum.yanit;
  try {
    const { oturumBelirteci } = await kimlik().rizaKabul(oturum.belirtec, govde.veri.surum);
    const yanit = new NextResponse(null, { status: 204 });
    cerezYaz(yanit, request, oturumBelirteci);
    return yanit;
  } catch (hata) {
    return hatayiCevir(hata);
  }
}
