import { NextResponse, type NextRequest } from 'next/server';

import { yenileGovdeSema } from '@/oturum/tipler';
import { cerezSil, cerezYaz, govdeOku, hatayiCevir, oturumGerekli } from '@/sunucu/bff';
import { KimlikHatasi, kimlik } from '@/sunucu/kimlik';

/** Cerezdeki oturumdan yeni erisim belirteci alir; istenirse etkin uyelik/kurum degisir. */
export async function POST(request: NextRequest) {
  const govde = await govdeOku(request, yenileGovdeSema);
  if ('yanit' in govde) return govde.yanit;
  const oturum = oturumGerekli(request);
  if ('yanit' in oturum) return oturum.yanit;

  try {
    const sonuc = await kimlik().oturumAl(oturum.belirtec, {
      ...(govde.veri.uyelikId ? { uyelikId: govde.veri.uyelikId } : {}),
      ...(govde.veri.kurumId ? { kurumId: govde.veri.kurumId } : {}),
    });
    const yanit = NextResponse.json(sonuc.oturum);
    if (sonuc.oturumBelirteci) cerezYaz(yanit, request, sonuc.oturumBelirteci);
    return yanit;
  } catch (hata) {
    const yanit = hatayiCevir(hata);
    // Gecersiz oturum: bozuk cerezi temizle ki istemci girise yonlensin.
    if (hata instanceof KimlikHatasi && hata.durum === 401) cerezSil(yanit);
    return yanit;
  }
}
