import { t } from '@kopru/i18n';

import type {
  GeriBildirimDegeri,
  KayitSatiri,
  KayitSaglayici,
  KayitSuzgeci,
} from '../api/kayitTipleri';
import { tarihEkle } from '../lib/saat';

export type TarihSecimi = 'hepsi' | 'bugun' | 'yedi' | 'otuz';
export type SonErisimSecimi = 'yok' | '7' | '30' | '90';

/** Tarih secimini kurum yerel gun araligina cevirir (dahil). */
export function tarihAraligi(
  secim: TarihSecimi,
  bugun: string,
): Pick<KayitSuzgeci, 'baslangic' | 'bitis'> {
  if (secim === 'bugun') return { baslangic: bugun, bitis: bugun };
  if (secim === 'yedi') return { baslangic: tarihEkle(bugun, -6), bitis: bugun };
  if (secim === 'otuz') return { baslangic: tarihEkle(bugun, -29), bitis: bugun };
  return {};
}

/** Son erisim secimini gelecekteki ISO ana cevirir; `yok` icin `undefined`. */
export function sonErisimBitis(secim: SonErisimSecimi, simdi: number): string | undefined {
  if (secim === 'yok') return undefined;
  return new Date(simdi + Number(secim) * 24 * 3_600_000).toISOString();
}

export function suresiDolduMu(k: Pick<KayitSatiri, 'gecerlilikBitis' | 'durum'>, simdi: number) {
  return (
    k.durum === 'suresi_doldu' ||
    (k.gecerlilikBitis !== null && Date.parse(k.gecerlilikBitis) <= simdi)
  );
}

export function saglayiciAdi(s: KayitSaglayici): string {
  return t(`mobil.kayit.saglayici.${s}`);
}

type IkonAdi = 'videocam' | 'logo-google' | 'logo-youtube' | 'cloud' | 'link';
export function saglayiciIkonu(s: KayitSaglayici): IkonAdi {
  switch (s) {
    case 'zoom':
      return 'videocam';
    case 'drive':
      return 'logo-google';
    case 'youtube':
      return 'logo-youtube';
    case 'onedrive':
      return 'cloud';
    case 'diger':
      return 'link';
  }
}

/** Satirin durum metni (renge ek olarak metin olarak da gosterilir). */
export function kayitDurumMetni(k: KayitSatiri, simdi: number): string {
  if (suresiDolduMu(k, simdi)) return t('mobil.kayit.suresiDoldu');
  if (k.bozuk) return t('mobil.kayit.bozuk');
  return k.izlendi ? t('mobil.kayit.izlendi') : t('mobil.kayit.yeni');
}

export function geriBildirimAdi(d: GeriBildirimDegeri): string {
  return t(`mobil.geriBildirim.${d}`);
}

export function varsayilanKayitBasligi(dersAdi: string, sira: number, toplam: number): string {
  const ad = dersAdi.trim() || t('mobil.ders.adsiz');
  const baslik =
    toplam <= 1
      ? t('mobil.kayit.ekle.varsayilanBaslik', { ders: ad })
      : t('mobil.kayit.ekle.varsayilanBaslikN', { ders: ad, n: sira });
  return baslik.slice(0, 200);
}
