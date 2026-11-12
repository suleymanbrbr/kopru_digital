import { KAYNAK_URL_MAKS, type KaynakSaglayici } from '@kopru/contracts';
import { t } from '@kopru/i18n';

/**
 * Baglanti saglayicisi tanima. Son soz sunucuda (`services/api` `kaynak-url.ts`); bu kopya yalniz
 * yazarken aninda geri bildirim ve ikon icindir. Kurallar ayni: https, kullanici bilgisi yok,
 * alan adi tam ya da `.alanadi` sonekiyle eslesir.
 */
const SAGLAYICILAR: readonly { saglayici: KaynakSaglayici; alanlar: readonly string[] }[] = [
  { saglayici: 'zoom', alanlar: ['zoom.us'] },
  { saglayici: 'drive', alanlar: ['drive.google.com', 'docs.google.com'] },
  { saglayici: 'youtube', alanlar: ['youtube.com', 'youtu.be'] },
  { saglayici: 'onedrive', alanlar: ['onedrive.live.com', '1drv.ms', 'sharepoint.com'] },
];

const alanEslesir = (host: string, alan: string) => host === alan || host.endsWith(`.${alan}`);

export type UrlHatasi = 'https' | 'gecersiz' | 'uzun' | 'kullanici_bilgisi';

export type UrlSonucu =
  { ok: true; url: string; saglayici: KaynakSaglayici } | { ok: false; hata: UrlHatasi };

export function urlCoz(girdi: string): UrlSonucu {
  const kirpilmis = girdi.trim();
  if (kirpilmis.length > KAYNAK_URL_MAKS) return { ok: false, hata: 'uzun' };
  if (!/^https:\/\//i.test(kirpilmis)) return { ok: false, hata: 'https' };
  const url = `https://${kirpilmis.slice('https://'.length)}`;
  let ayrisan: URL;
  try {
    ayrisan = new URL(url);
  } catch {
    return { ok: false, hata: 'gecersiz' };
  }
  if (ayrisan.hostname === '') return { ok: false, hata: 'gecersiz' };
  if (ayrisan.username !== '' || ayrisan.password !== '') {
    return { ok: false, hata: 'kullanici_bilgisi' };
  }
  const host = ayrisan.hostname.toLowerCase().replace(/\.$/, '');
  const eslesen = SAGLAYICILAR.find((s) => s.alanlar.some((a) => alanEslesir(host, a)));
  return { ok: true, url, saglayici: eslesen?.saglayici ?? 'diger' };
}

export function saglayiciAdi(saglayici: KaynakSaglayici): string {
  return t(`kayitGeriBildirim.saglayici.${saglayici}`);
}

/** Baglantinin guvenle acilabilecegi adres: yalniz https. */
export function guvenliAdres(url: string): string | null {
  return /^https:\/\//i.test(url) ? url : null;
}
