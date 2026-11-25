/**
 * Yonetim paneli icerik guvenligi politikasi ve sabit guvenlik basliklari (guvenlik denetimi S1).
 * Panel dis kaynak yuklemez: her sey kendi origin'inden; BFF disina baglanti yok.
 * Bilinen odun: Next.js onyukleme betikleri icin `script-src` `'unsafe-inline'` (nonce dinamik cizim ister).
 */
export function cspOlustur(uretim: boolean): string {
  const yonergeler: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", ...(uretim ? [] : ["'unsafe-eval'"])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ...(uretim ? [] : ['ws:', 'wss:'])],
    'frame-src': ["'none'"],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(yonergeler)
    .map(([ad, degerler]) => `${ad} ${degerler.join(' ')}`)
    .join('; ');
}

export function sabitBasliklar(uretim: boolean): { key: string; value: string }[] {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
    { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
    { key: 'Cache-Control', value: 'no-store' },
    { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    ...(uretim
      ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
      : []),
  ];
}
