/**
 * Icerik Guvenligi Politikasi (CSP) ve ek guvenlik basliklari (guvenlik denetimi S1).
 *
 * Politika `proxy.ts` icinde her sayfa yanitina eklenir; calisma zamani ortamini okur
 * (`WEB_CSP_EK_KAYNAKLAR`: bosluk/virgulle ayrilmis origin listesi; S3 uyumlu depolamanin genel adresi gibi).
 *
 * Bilinen odun: Next.js'in satir ici onyukleme betikleri icin `script-src` `'unsafe-inline'` icerir (nonce,
 * sayfalari dinamik cizmeyi gerektirir). Dis betik kaynagi, `eval`, `<object>`, baska siteye form gonderme,
 * `<base>` degistirme ve cerceveleme kapali; betik yalniz kendi origin'imizden ve odeme saglayicisindan yuklenir.
 */

/** Odeme formu (iyzico) `srcdoc` iframe'inde calisir ve ust sayfanin politikasini miras alir. */
const ODEME_KAYNAKLARI = ['https://*.iyzipay.com', 'https://*.iyzico.com'];

export interface CspSecenekleri {
  uretim: boolean;
  /** Medya depolamasi vb. ek origin'ler (img, media, connect). */
  ekKaynaklar?: readonly string[];
}

export function ekKaynaklariOku(ham: string | undefined, uretim: boolean): string[] {
  const liste = (ham ?? '')
    .split(/[\s,]+/)
    .map((k) => k.trim())
    // Yalniz http(s) origin'i; `*`, `data:` veya yol/sema enjeksiyonu kabul edilmez.
    .filter((k) => /^https?:\/\/[A-Za-z0-9.*-]+(:\d+)?$/.test(k));
  if (!uretim && liste.length === 0) return ['http://localhost:9000'];
  return liste;
}

export function cspOlustur({ uretim, ekKaynaklar = [] }: CspSecenekleri): string {
  const ek = [...ekKaynaklar];
  const yonergeler: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'unsafe-inline'",
      ...(uretim ? [] : ["'unsafe-eval'"]),
      ...ODEME_KAYNAKLARI,
    ],
    'style-src': ["'self'", "'unsafe-inline'", ...ODEME_KAYNAKLARI],
    'img-src': ["'self'", 'data:', 'blob:', ...ek, ...ODEME_KAYNAKLARI],
    'media-src': ["'self'", 'blob:', ...ek],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ...ek, ...(uretim ? [] : ['ws:', 'wss:']), ...ODEME_KAYNAKLARI],
    'frame-src': ["'self'", ...ODEME_KAYNAKLARI],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'", ...ODEME_KAYNAKLARI],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(yonergeler)
    .map(([ad, degerler]) => `${ad} ${degerler.join(' ')}`)
    .join('; ');
}

/** Tum yanitlara (`next.config.ts`) eklenen sabit basliklar. */
export function sabitBasliklar(uretim: boolean): { key: string; value: string }[] {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value:
        'camera=(self), microphone=(self), geolocation=(), payment=(self), usb=(), interest-cohort=()',
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
    { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
    ...(uretim
      ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
      : []),
  ];
}
