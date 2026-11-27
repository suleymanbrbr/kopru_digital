import { isIP } from 'node:net';

/**
 * Web sunucusu (BFF) `api`yi kendi adresinden cagirir; `api` kullaniciyi ayirt edebilsin diye
 * gercek istemci IP'si `X-Forwarded-For` ile iletilir (ADR 0009). `api` bu basligi yalniz
 * `TRUST_PROXY` listesindeki kaynaktan kabul eder.
 *
 * `WEB_GUVENILEN_PROXY_SAYISI`: web sunucusunun onundeki guvenilen proxy sayisi. Gelen basligin
 * soldaki degerleri istemcinin yazabilecegi degerlerdir; yalniz sagdan bu kadar sirada olan deger
 * proxy'nin gordugu gercek adrestir. 0 (varsayilan): proxy yok, baslik gonderilmez.
 */
export function istemciIpCoz(xff: string | null, guvenilenProxySayisi: number): string | null {
  if (!xff || guvenilenProxySayisi < 1) return null;
  const degerler = xff.split(',').map((d) => d.trim());
  const deger = degerler[degerler.length - guvenilenProxySayisi];
  return deger !== undefined && isIP(deger) !== 0 ? deger : null;
}

function guvenilenProxySayisi(): number {
  const n = Number(process.env.WEB_GUVENILEN_PROXY_SAYISI ?? '0');
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Gelen isteğin basliklarindan `api`ye eklenecek basliklari uretir (tek deger; zincir iletilmez). */
export function istemciIpBasliklari(gelen: Pick<Headers, 'get'>): Record<string, string> {
  const ip = istemciIpCoz(gelen.get('x-forwarded-for'), guvenilenProxySayisi());
  return ip ? { 'x-forwarded-for': ip } : {};
}

const UA_AZAMI = 300;

/**
 * Kullanicinin tarayici `User-Agent`i `api`ye iletilir; yoksa Node'un `node` degeri oturum
 * listesinde cihaz adi olarak gorunur. Deger yalniz Oturumlarim ekraninda okunur cihaz adina
 * cevrilir (guvenlik karari verilmez); kontrol karakterleri atilir, uzunluk sinirlanir.
 */
export function istemciUserAgentBasliklari(gelen: Pick<Headers, 'get'>): Record<string, string> {
  const ham = gelen.get('user-agent') ?? '';
  let ua = '';
  for (let i = 0; i < ham.length; i++) {
    const kod = ham.charCodeAt(i);
    if (kod >= 0x20 && kod !== 0x7f) ua += ham.charAt(i);
  }
  ua = ua.trim();
  return ua ? { 'user-agent': ua.slice(0, UA_AZAMI) } : {};
}
