import { NextResponse, type NextRequest } from 'next/server';

import { ayniKaynakMi, hataYaniti } from './bff';
import { hesapMock } from './hesap-mock';
import { istemciIpBasliklari } from './istemci-ip';
import { mockModu } from './kimlik';
import { apiAdresi } from './kimlik/api';

/**
 * `/api/hesap/<yol>` -> `api` servisinin `/v1/hesap/<yol>` ucu. Kiraci uc noktalari icin ince bir
 * gecittir: tarayici bellekteki kisa omurlu erisim belirtecini Bearer olarak yollar, gecit onu aynen
 * iletir. Yenileme/oturum belirteci (httpOnly cerez) bu yola hic girmez. Yalniz asagidaki
 * izinli yollar gecer; gerisi 404.
 */
const IZINLI_YOLLAR: readonly RegExp[] = [
  /^kurumlar\/[^/]+\/(gruplar|davetler|uyelikler|atamalar)(\/|$)/,
  /^davetler\/kabul$/,
  /^oturumlar(\/|$)/,
  /^sinif-kodu\/(katil|istekler)(\/|$)/,
];

const YONTEMLER = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);
const PARCA = /^[A-Za-z0-9_-]+$/;

export function yolIzinliMi(parcalar: readonly string[]): boolean {
  if (parcalar.length === 0 || !parcalar.every((p) => PARCA.test(p))) return false;
  const yol = parcalar.join('/');
  return IZINLI_YOLLAR.some((desen) => desen.test(yol));
}

/** `api` yanitini oldugu gibi (durum + JSON govde) iletir. */
async function ilet(yanit: Response): Promise<NextResponse> {
  const metin = await yanit.text();
  return new NextResponse(metin.length > 0 ? metin : null, {
    status: yanit.status,
    headers: metin.length > 0 ? { 'content-type': 'application/json; charset=utf-8' } : {},
  });
}

export async function hesapVekili(
  request: NextRequest,
  parcalar: readonly string[],
): Promise<NextResponse> {
  if (!YONTEMLER.has(request.method) || !yolIzinliMi(parcalar)) {
    return hataYaniti('bulunamadi', 'Kaynak bulunamadı.', 404);
  }
  if (request.method !== 'GET' && !ayniKaynakMi(request)) {
    return hataYaniti('yasak', 'İstek kaynağı geçersiz.', 403);
  }
  const erisim = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!erisim) return hataYaniti('yetkisiz', 'Oturum açmanız gerekiyor.', 401);

  const yol = parcalar.join('/');
  const arama = request.nextUrl.search;
  const govde = request.method === 'GET' || request.method === 'DELETE' ? '' : await request.text();

  if (mockModu()) {
    const sonuc = hesapMock({
      yontem: request.method,
      yol,
      sorgu: request.nextUrl.searchParams,
      govde: govde.length > 0 ? safeJson(govde) : undefined,
    });
    return sonuc.govde === undefined
      ? new NextResponse(null, { status: sonuc.durum })
      : NextResponse.json(sonuc.govde, { status: sonuc.durum });
  }

  try {
    const yanit = await fetch(`${apiAdresi()}/v1/hesap/${yol}${arama}`, {
      method: request.method,
      headers: {
        authorization: `Bearer ${erisim}`,
        ...istemciIpBasliklari(request.headers),
        ...(request.method === 'GET' || request.method === 'DELETE'
          ? {}
          : { 'content-type': 'application/json' }),
      },
      // Bos govdeli JSON istegi `api`da 400 verir; bos govde yerine `{}` gonderilir.
      ...(request.method === 'GET' || request.method === 'DELETE'
        ? {}
        : { body: govde.length > 0 ? govde : '{}' }),
      cache: 'no-store',
    });
    return await ilet(yanit);
  } catch {
    return hataYaniti('hizmet_kullanilamiyor', 'Sunucuya ulaşılamadı.', 502);
  }
}

function safeJson(metin: string): unknown {
  try {
    return JSON.parse(metin) as unknown;
  } catch {
    return undefined;
  }
}
