import { NextResponse, type NextRequest } from 'next/server';

import { kodDogrulaGovdeSema, kodSema, telefonSema } from '@/oturum/tipler';
import { cerezYaz, govdeOku, hataYaniti, hatayiCevir } from '@/sunucu/bff';
import { kimlik } from '@/sunucu/kimlik';

export async function POST(request: NextRequest) {
  const govde = await govdeOku(request, kodDogrulaGovdeSema);
  if ('yanit' in govde) return govde.yanit;

  const telefon = telefonSema.safeParse(govde.veri.telefon);
  const kod = kodSema.safeParse(govde.veri.kod);
  if (!telefon.success) return hataYaniti('telefon_gecersiz', 'Telefon numarası geçersiz.', 400);
  if (!kod.success) return hataYaniti('otp_gecersiz', 'Kod geçersiz.', 400);

  try {
    const adaptor = kimlik();
    const { oturumBelirteci } = await adaptor.kodDogrula(`+90${telefon.data}`, kod.data);
    const { oturum, oturumBelirteci: yeni } = await adaptor.oturumAl(oturumBelirteci);
    const yanit = NextResponse.json(oturum);
    cerezYaz(yanit, request, yeni ?? oturumBelirteci);
    return yanit;
  } catch (hata) {
    return hatayiCevir(hata);
  }
}
