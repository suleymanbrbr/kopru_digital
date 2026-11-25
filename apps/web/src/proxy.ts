import { NextResponse, type NextRequest } from 'next/server';

import { OTURUM_CEREZI } from '@/sunucu/bff';
import { cspOlustur, ekKaynaklariOku } from '@/sunucu/csp';

/** Oturumsuz da acilabilen sayfalar: giris, davet kabulu (sayfa kendi yonlendirmesini yapar), e-posta dogrulama. */
function acikYol(yol: string): boolean {
  return yol === '/giris' || yol === '/eposta-dogrula' || yol.startsWith('/davet/');
}

/**
 * Hafif yonlendirme: oturum cerezi yoksa giris disindaki sayfalara girilmez, varsa giris
 * sayfasi atlanir. Gercek yetki kontrolu BFF ve `api` tarafindadir; cerezin gecerliligi
 * istemcide `/api/oturum/yenile` ile dogrulanir.
 */
export function proxy(request: NextRequest) {
  const yanit = yonlendir(request);
  const uretim = process.env.NODE_ENV === 'production';
  yanit.headers.set(
    'Content-Security-Policy',
    cspOlustur({ uretim, ekKaynaklar: ekKaynaklariOku(process.env.WEB_CSP_EK_KAYNAKLAR, uretim) }),
  );
  return yanit;
}

function yonlendir(request: NextRequest): NextResponse {
  const cerezVar = request.cookies.has(OTURUM_CEREZI);
  const { pathname } = request.nextUrl;

  if (!cerezVar && !acikYol(pathname)) {
    return NextResponse.redirect(new URL('/giris', request.url));
  }
  if (cerezVar && pathname === '/giris') {
    return NextResponse.redirect(new URL('/kurum-sec', request.url));
  }
  return NextResponse.next();
}

export const config = {
  // API, Next ic dosyalari ve statik varliklar disindaki tum yollar.
  matcher: ['/((?!api|_next|karakter|favicon.ico|.*\\..*).*)'],
};
