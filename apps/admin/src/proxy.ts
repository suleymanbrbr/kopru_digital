import { NextResponse, type NextRequest } from 'next/server';

import { OTURUM_CEREZI } from '@/sunucu/bff';

/**
 * Hafif yonlendirme: oturum cerezi yoksa giris disindaki sayfalara girilmez, varsa giris sayfasi
 * atlanir. Gercek yetki (IP, platform rolu, ikinci adim) her istekte `api` tarafinda denetlenir;
 * sayfalar rol ve ikinci adim durumunu `/api/platform/ben` ile ogrenir.
 */
export function proxy(request: NextRequest) {
  const cerezVar = request.cookies.has(OTURUM_CEREZI);
  const { pathname } = request.nextUrl;

  if (!cerezVar && pathname !== '/giris') {
    return NextResponse.redirect(new URL('/giris', request.url));
  }
  if (cerezVar && pathname === '/giris') {
    return NextResponse.redirect(new URL('/kurumlar', request.url));
  }
  return NextResponse.next();
}

export const config = {
  // API, Next ic dosyalari ve statik varliklar disindaki tum yollar.
  matcher: ['/((?!api|_next|favicon.ico|.*\\..*).*)'],
};
