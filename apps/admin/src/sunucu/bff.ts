import { NextResponse, type NextRequest } from 'next/server';

/**
 * Yonetim paneli BFF'i: tum belirtecler httpOnly cerezde tutulur, tarayici JS'i hicbirini gormez.
 * - oturum: opak oturum belirteci (kisa omurlu, 8 saat),
 * - erisim: `POST /auth/token` ile alinan kisa omurlu JWT (BFF her istekte Bearer olarak yollar),
 * - taklit: taklit belirteci + ozeti (yalniz salt okunur okuma vekilinde kullanilir).
 */
export const OTURUM_CEREZI = 'kopru_yonetim_oturum';
export const ERISIM_CEREZI = 'kopru_yonetim_erisim';
export const TAKLIT_CEREZI = 'kopru_yonetim_taklit';

const OTURUM_OMRU_SN = 8 * 60 * 60;

export function cerez(request: NextRequest, ad: string): string | undefined {
  return request.cookies.get(ad)?.value;
}

function guvenliMi(request: NextRequest): boolean {
  return (
    request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https'
  );
}

export function cerezYaz(
  yanit: NextResponse,
  request: NextRequest,
  ad: string,
  deger: string,
  omurSn: number,
): void {
  yanit.cookies.set(ad, deger, {
    httpOnly: true,
    sameSite: 'strict',
    secure: guvenliMi(request),
    path: '/',
    maxAge: Math.max(1, Math.floor(omurSn)),
  });
}

export function oturumCerezYaz(yanit: NextResponse, request: NextRequest, deger: string): void {
  cerezYaz(yanit, request, OTURUM_CEREZI, deger, OTURUM_OMRU_SN);
}

export function cerezSil(yanit: NextResponse, ...adlar: string[]): void {
  for (const ad of adlar) {
    yanit.cookies.set(ad, '', { httpOnly: true, path: '/', maxAge: 0 });
  }
}

export function hataYaniti(
  kod: string,
  mesaj: string,
  durum: number,
  ayrintilar?: unknown,
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: kod,
        message: mesaj,
        ...(ayrintilar === undefined ? {} : { details: ayrintilar }),
      },
    },
    { status: durum, headers: { 'cache-control': 'no-store' } },
  );
}

/**
 * CSRF savunmasi: durum degistiren isteklerde `Origin` varsa bu sitenin kendisi olmali
 * (SameSite=Strict cerez ile birlikte ikinci katman).
 */
export function ayniKaynakMi(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

/** Serbest JSON govdeyi okur (bozuksa `null`). */
export async function govdeOku(request: NextRequest): Promise<unknown> {
  return request.json().catch(() => null);
}

export function nesneMi(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
