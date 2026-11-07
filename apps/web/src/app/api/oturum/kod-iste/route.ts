import { NextResponse, type NextRequest } from 'next/server';

import { telefonSema, kodIsteGovdeSema } from '@/oturum/tipler';
import { govdeOku, hataYaniti, hatayiCevir } from '@/sunucu/bff';
import { kimlik } from '@/sunucu/kimlik';

export async function POST(request: NextRequest) {
  const govde = await govdeOku(request, kodIsteGovdeSema);
  if ('yanit' in govde) return govde.yanit;

  const telefon = telefonSema.safeParse(govde.veri.telefon);
  if (!telefon.success) return hataYaniti('telefon_gecersiz', 'Telefon numarası geçersiz.', 400);

  try {
    const sonuc = await kimlik().kodIste(`+90${telefon.data}`);
    return NextResponse.json(sonuc);
  } catch (hata) {
    return hatayiCevir(hata);
  }
}
