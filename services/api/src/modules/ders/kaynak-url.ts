import { KAYNAK_URL_MAKS, kaynakHataKodlari, type KaynakSaglayici } from '@kopru/contracts';
import { AppError } from '@kopru/service-kit';

/** Alan adi eslesmesi tam ya da `.alanadi` sonekiyle olur (`evilzoom.us` zoom degildir). */
const SAGLAYICILAR: readonly { saglayici: KaynakSaglayici; alanlar: readonly string[] }[] = [
  { saglayici: 'zoom', alanlar: ['zoom.us'] },
  { saglayici: 'drive', alanlar: ['drive.google.com', 'docs.google.com'] },
  { saglayici: 'youtube', alanlar: ['youtube.com', 'youtu.be'] },
  { saglayici: 'onedrive', alanlar: ['onedrive.live.com', '1drv.ms', 'sharepoint.com'] },
];

const alanEslesir = (host: string, alan: string) => host === alan || host.endsWith(`.${alan}`);

const urlHatasi = (mesaj: string) =>
  new AppError(422, kaynakHataKodlari.urlGecersiz, mesaj, { alan: 'url' });

/**
 * Baglantiyi dogrular ve saglayiciyi alan adindan tanir. Yalniz `https://`, kullanici bilgisi (`user@`)
 * olmayan, en cok 2000 karakter. Dondurulen `url` normallestirilmis (`URL.href`) degil, kirpilmis girdidir.
 */
export function kaynakUrlCoz(girdi: string): { url: string; saglayici: KaynakSaglayici } {
  const kirpilmis = girdi.trim();
  if (kirpilmis.length > KAYNAK_URL_MAKS)
    throw urlHatasi('Bağlantı en çok 2000 karakter olabilir.');
  if (!/^https:\/\//i.test(kirpilmis)) throw urlHatasi('Bağlantı https:// ile başlamalı.');
  // Sema harfi kucuge cevrilir: veritabani CHECK'i (`url ~ '^https://'`) buyuk/kucuk harf duyarlidir.
  const url = `https://${kirpilmis.slice('https://'.length)}`;
  let ayrisan: URL;
  try {
    ayrisan = new URL(url);
  } catch {
    throw urlHatasi('Bağlantı geçerli bir adres değil.');
  }
  if (ayrisan.protocol !== 'https:' || ayrisan.hostname === '') {
    throw urlHatasi('Bağlantı geçerli bir https adresi olmalı.');
  }
  if (ayrisan.username !== '' || ayrisan.password !== '') {
    throw urlHatasi('Bağlantıda kullanıcı bilgisi olamaz.');
  }
  const host = ayrisan.hostname.toLowerCase().replace(/\.$/, '');
  const eslesen = SAGLAYICILAR.find((s) => s.alanlar.some((a) => alanEslesir(host, a)));
  return { url, saglayici: eslesen?.saglayici ?? 'diger' };
}
