import type { KayitSaglayici } from '../api/kayitTipleri';

/**
 * Istemci tarafi saglayici tanima (yalniz ikon ve uyari icin). Son soz sunucudadir
 * (`kaynak-url.ts`): ayni alan adi listesini kullanir, tam ya da `.alanadi` eslesmesi arar.
 */
const SAGLAYICILAR: readonly { saglayici: KayitSaglayici; alanlar: readonly string[] }[] = [
  { saglayici: 'zoom', alanlar: ['zoom.us'] },
  { saglayici: 'drive', alanlar: ['drive.google.com', 'docs.google.com'] },
  { saglayici: 'youtube', alanlar: ['youtube.com', 'youtu.be'] },
  { saglayici: 'onedrive', alanlar: ['onedrive.live.com', '1drv.ms', 'sharepoint.com'] },
];

export const KAYIT_URL_MAKS = 2000;

const alanEslesir = (host: string, alan: string) => host === alan || host.endsWith(`.${alan}`);

/**
 * Yapistirilan metni baglantiya cevirir: bosluklari kirpar; semasiz `zoom.us/j/1` gibi girdilere
 * `https://` ekler. `http://` ve diger semalar oldugu gibi birakilir (gecerli sayilmaz).
 */
export function baglantiyiDuzenle(girdi: string): string {
  const k = girdi.trim();
  if (k === '' || /^[a-z][a-z0-9+.-]*:\/\//i.test(k)) return k;
  // Bosluksuz, noktali ve yola benzeyen girdi: semasiz adres.
  if (!/\s/.test(k) && /^[^/.]+\.[^/]+/.test(k)) return `https://${k}`;
  return k;
}

export type BaglantiSonucu =
  | { gecerli: true; url: string; saglayici: KayitSaglayici }
  | { gecerli: false; neden: 'bos' | 'https' | 'gecersiz' | 'uzun' | 'kullanici' };

/** Alan adindan saglayici; taninmazsa `diger`. */
export function saglayiciTani(url: string): KayitSaglayici {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return 'diger';
  }
  return (
    SAGLAYICILAR.find((s) => s.alanlar.some((a) => alanEslesir(host, a)))?.saglayici ?? 'diger'
  );
}

/** Baglantiyi dogrular (sunucu kurallariyla ayni: yalniz https, kullanici bilgisi yok, 2000 karakter). */
export function baglantiyiCoz(girdi: string): BaglantiSonucu {
  const url = baglantiyiDuzenle(girdi);
  if (url === '') return { gecerli: false, neden: 'bos' };
  if (url.length > KAYIT_URL_MAKS) return { gecerli: false, neden: 'uzun' };
  if (!/^https:\/\//i.test(url)) return { gecerli: false, neden: 'https' };
  let ayrisan: URL;
  try {
    ayrisan = new URL(url);
  } catch {
    return { gecerli: false, neden: 'gecersiz' };
  }
  if (ayrisan.hostname === '' || !ayrisan.hostname.includes('.')) {
    return { gecerli: false, neden: 'gecersiz' };
  }
  if (ayrisan.username !== '' || ayrisan.password !== '') {
    return { gecerli: false, neden: 'kullanici' };
  }
  return {
    gecerli: true,
    url: `https://${url.slice('https://'.length)}`,
    saglayici: saglayiciTani(url),
  };
}
