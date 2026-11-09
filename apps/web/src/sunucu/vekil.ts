import { NextResponse, type NextRequest } from 'next/server';

import { ayniKaynakMi, hataYaniti } from './bff';
import { istemciIpBasliklari } from './istemci-ip';
import { mockModu } from './kimlik';
import { apiAdresi } from './kimlik/api';

/**
 * `/api/<servis>/<yol>` -> `api` servisinin `/v1/<servis>/<yol>` ucu icin ortak gecit. Tarayici bellekteki
 * kisa omurlu erisim belirtecini Bearer olarak yollar, gecit onu aynen iletir; yenileme/oturum
 * belirteci (httpOnly cerez) bu yola hic girmez. Yalniz servis basina izinli yollar gecer, gerisi 404.
 */

export interface MockIstek {
  yontem: string;
  /** `/v1/<servis>/` sonrasi yol. */
  yol: string;
  sorgu: URLSearchParams;
  govde: unknown;
  /** Kucuk harfli istek basliklari (mock `Idempotency-Key` gibi basliklari okur). */
  basliklar: Readonly<Record<string, string>>;
}

export interface MockYanit {
  durum: number;
  govde?: unknown;
  /** Verilirse JSON yerine ikili govde (`govde` yok sayilir). */
  ikili?: { bayt: Uint8Array; tur: string; dosyaAdi: string };
}

export interface VekilTanimi {
  servis: 'hesap' | 'ders' | 'finans';
  /** Yol parcalarinin (birlestirilmis) eslesmesi gereken desenler. */
  izinli: readonly RegExp[];
  /** Yalniz GET'e acik ek desenler (ornegin kurum bilgisini okuma). */
  yalnizOkuma?: readonly RegExp[];
  mock: (istek: MockIstek) => MockYanit;
}

const YONTEMLER = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);
const PARCA = /^[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parcalar guvenli karakterlerden olusuyor ve yol izinli desenlerden birine uyuyor mu? */
export function yolIzinliMi(
  parcalar: readonly string[],
  izinli: readonly RegExp[],
  yontem = 'GET',
  yalnizOkuma: readonly RegExp[] = [],
): boolean {
  if (parcalar.length === 0 || !parcalar.every((p) => PARCA.test(p))) return false;
  const yol = parcalar.join('/');
  if (izinli.some((desen) => desen.test(yol))) return true;
  return yontem === 'GET' && yalnizOkuma.some((desen) => desen.test(yol));
}

/**
 * `api` yanitini oldugu gibi iletir. JSON ve bos govde metin olarak; baska her sey (ornegin `.xlsx`
 * indirmesi) bayt olarak, `content-type` ve `content-disposition` korunarak.
 */
export async function yanitiIlet(yanit: Response): Promise<NextResponse> {
  const tur = yanit.headers.get('content-type') ?? '';
  if (yanit.status !== 204 && tur.length > 0 && !tur.includes('json')) {
    const basliklar: Record<string, string> = { 'content-type': tur, 'cache-control': 'no-store' };
    const ek = yanit.headers.get('content-disposition');
    if (ek) basliklar['content-disposition'] = ek;
    return new NextResponse(await yanit.arrayBuffer(), {
      status: yanit.status,
      headers: basliklar,
    });
  }
  const metin = await yanit.text();
  const basliklar: Record<string, string> = {};
  if (metin.length > 0) basliklar['content-type'] = 'application/json; charset=utf-8';
  const tekrar = yanit.headers.get('idempotent-replayed');
  if (tekrar) basliklar['idempotent-replayed'] = tekrar;
  return new NextResponse(metin.length > 0 ? metin : null, {
    status: yanit.status,
    headers: basliklar,
  });
}

function guvenliJson(metin: string): unknown {
  try {
    return JSON.parse(metin) as unknown;
  } catch {
    return undefined;
  }
}

function mockYaniti(sonuc: MockYanit): NextResponse {
  if (sonuc.ikili) {
    return new NextResponse(sonuc.ikili.bayt as BodyInit, {
      status: sonuc.durum,
      headers: {
        'content-type': sonuc.ikili.tur,
        'content-disposition': `attachment; filename="${sonuc.ikili.dosyaAdi}"`,
      },
    });
  }
  return sonuc.govde === undefined
    ? new NextResponse(null, { status: sonuc.durum })
    : NextResponse.json(sonuc.govde, { status: sonuc.durum });
}

export async function servisVekili(
  tanim: VekilTanimi,
  request: NextRequest,
  parcalar: readonly string[],
): Promise<NextResponse> {
  if (
    !YONTEMLER.has(request.method) ||
    !yolIzinliMi(parcalar, tanim.izinli, request.method, tanim.yalnizOkuma)
  ) {
    return hataYaniti('bulunamadi', 'Kaynak bulunamadı.', 404);
  }
  if (request.method !== 'GET' && !ayniKaynakMi(request)) {
    return hataYaniti('yasak', 'İstek kaynağı geçersiz.', 403);
  }
  const erisim = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!erisim) return hataYaniti('yetkisiz', 'Oturum açmanız gerekiyor.', 401);

  const yol = parcalar.join('/');
  const arama = request.nextUrl.search;
  const govdesiz = request.method === 'GET' || request.method === 'DELETE';
  const govde = govdesiz ? '' : await request.text();
  const anahtar = request.headers.get('idempotency-key');
  const idempotency = anahtar && UUID.test(anahtar) ? anahtar : undefined;

  if (mockModu()) {
    return mockYaniti(
      tanim.mock({
        yontem: request.method,
        yol,
        sorgu: request.nextUrl.searchParams,
        govde: govde.length > 0 ? guvenliJson(govde) : undefined,
        basliklar: idempotency ? { 'idempotency-key': idempotency } : {},
      }),
    );
  }

  try {
    const yanit = await fetch(`${apiAdresi()}/v1/${tanim.servis}/${yol}${arama}`, {
      method: request.method,
      headers: {
        authorization: `Bearer ${erisim}`,
        ...istemciIpBasliklari(request.headers),
        ...(idempotency ? { 'idempotency-key': idempotency } : {}),
        ...(govdesiz ? {} : { 'content-type': 'application/json' }),
      },
      // Bos govdeli JSON istegi `api`da 400 verir; bos govde yerine `{}` gonderilir.
      ...(govdesiz ? {} : { body: govde.length > 0 ? govde : '{}' }),
      cache: 'no-store',
    });
    return await yanitiIlet(yanit);
  } catch {
    return hataYaniti('hizmet_kullanilamiyor', 'Sunucuya ulaşılamadı.', 502);
  }
}
