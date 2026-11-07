import { NextResponse, type NextRequest } from 'next/server';

import { hataYaniti, hatayiCevir, oturumGerekli } from '@/sunucu/bff';
import { kimlik } from '@/sunucu/kimlik';

/** Etkin kurumun cozulmus modul listesi. Istemci bellekteki erisim belirtecini Bearer olarak yollar. */
export async function GET(request: NextRequest) {
  const oturum = oturumGerekli(request);
  if ('yanit' in oturum) return oturum.yanit;

  const erisim = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  const kurumId = request.nextUrl.searchParams.get('kurumId');
  if (!erisim) return hataYaniti('yetkisiz', 'Oturum açmanız gerekiyor.', 401);
  if (!kurumId) return hataYaniti('dogrulama_hatasi', 'kurumId gerekli.', 400);

  try {
    return NextResponse.json(await kimlik().kurumBaglami(oturum.belirtec, erisim, kurumId));
  } catch (hata) {
    return hatayiCevir(hata);
  }
}
