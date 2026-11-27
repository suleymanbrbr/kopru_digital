/**
 * Ham `User-Agent` metninden okunur cihaz adi uretir ("iPhone · Safari", "Mac · Chrome").
 * Bagimlilik yok; yalniz sik gorulen istemciler taninir. Taninmayan (ornegin `node`, `curl`)
 * metin icin `null` doner; istemci "Bilinmeyen cihaz" yazar. Ham metin asla gosterilmez.
 *
 * Mobil uygulama `Kopru-Mobil/<surum> (ios|android)` yollar (apps/mobile/src/api/gercek.ts).
 */
const MOBIL = /^Kopru-Mobil\/\S+ \((ios|android)\)/i;

function isletimSistemi(ua: string): string | null {
  if (/iPhone|iPod/.test(ua)) return 'iPhone';
  if (ua.includes('iPad')) return 'iPad';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('CrOS')) return 'Chromebook';
  // iPad "masaustu" Safari kendini Mac olarak tanitir; dokunmatik oldugu UA'dan anlasilmaz.
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
  if (/Linux|X11/.test(ua)) return 'Linux';
  return null;
}

function tarayici(ua: string): string | null {
  if (/Edg(e|A|iOS)?\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (ua.includes('SamsungBrowser/')) return 'Samsung Internet';
  if (/Firefox\/|FxiOS\//.test(ua)) return 'Firefox';
  if (/Chrome\/|CriOS\//.test(ua)) return 'Chrome';
  if (ua.includes('Safari/') && ua.includes('Version/')) return 'Safari';
  return null;
}

export function cihazAdiCoz(userAgent: string | null | undefined): string | null {
  const ua = userAgent?.trim();
  if (!ua) return null;
  const mobil = MOBIL.exec(ua);
  if (mobil) {
    return `${mobil[1]?.toLowerCase() === 'ios' ? 'iOS' : 'Android'} · Köprü uygulaması`;
  }
  const os = isletimSistemi(ua);
  const tr = tarayici(ua);
  if (os && tr) return `${os} · ${tr}`;
  return os ?? tr;
}
