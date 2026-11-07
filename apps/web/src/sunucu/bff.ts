import { NextResponse, type NextRequest } from 'next/server';
import type { z } from 'zod';

import { KimlikHatasi } from './kimlik';

/** Yenileme/oturum belirtecini tasiyan httpOnly cerez. */
export const OTURUM_CEREZI = 'kopru_oturum';
const OTUZ_GUN_SN = 30 * 24 * 60 * 60;

export function oturumBelirteci(request: NextRequest): string | undefined {
  return request.cookies.get(OTURUM_CEREZI)?.value;
}

export function cerezYaz(response: NextResponse, request: NextRequest, deger: string): void {
  response.cookies.set(OTURUM_CEREZI, deger, {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https',
    path: '/',
    maxAge: OTUZ_GUN_SN,
  });
}

export function cerezSil(response: NextResponse): void {
  response.cookies.set(OTURUM_CEREZI, '', { httpOnly: true, path: '/', maxAge: 0 });
}

export function hataYaniti(kod: string, mesaj: string, durum: number): NextResponse {
  return NextResponse.json({ error: { code: kod, message: mesaj } }, { status: durum });
}

export function hatayiCevir(hata: unknown): NextResponse {
  if (hata instanceof KimlikHatasi) return hataYaniti(hata.kod, hata.message, hata.durum);
  console.error('beklenmeyen BFF hatasi', hata);
  return hataYaniti('sunucu_hatasi', 'Beklenmeyen bir hata oluştu.', 500);
}

/**
 * CSRF savunmasi: durum degistiren isteklerde `Origin` varsa bu sitenin kendisi olmali
 * (SameSite=Lax cerez ile birlikte ikinci katman).
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

/** JSON govdeyi sema ile dogrular; basarisizsa hazir hata yanitini dondurur. */
export async function govdeOku<S extends z.ZodType>(
  request: NextRequest,
  sema: S,
): Promise<{ veri: z.output<S> } | { yanit: NextResponse }> {
  if (!ayniKaynakMi(request)) {
    return { yanit: hataYaniti('yasak', 'İstek kaynağı geçersiz.', 403) };
  }
  const ham: unknown = await request.json().catch(() => null);
  const sonuc = sema.safeParse(ham);
  if (!sonuc.success) return { yanit: hataYaniti('dogrulama_hatasi', 'İstek geçersiz.', 400) };
  return { veri: sonuc.data };
}

export function oturumGerekli(request: NextRequest): { belirtec: string } | { yanit: NextResponse } {
  const belirtec = oturumBelirteci(request);
  return belirtec
    ? { belirtec }
    : { yanit: hataYaniti('yetkisiz', 'Oturum açmanız gerekiyor.', 401) };
}
