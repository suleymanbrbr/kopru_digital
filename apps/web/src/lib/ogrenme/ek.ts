import {
  EK_EN_FAZLA_DOSYA,
  MEDYA_GORSEL_MIME,
  MEDYA_PDF_MIME,
  MEDYA_TUR_KURALLARI,
} from '@kopru/contracts';

/** Ek olarak yuklenebilen MIME turleri (PDF + JPEG/PNG/WebP). HEIC/SVG medyada kabul edilmez. */
export const EK_IZINLI_MIME: readonly string[] = [...MEDYA_PDF_MIME, ...MEDYA_GORSEL_MIME];
export const EK_ACCEPT = EK_IZINLI_MIME.join(',');
export { EK_EN_FAZLA_DOSYA };

/** `odev_eki` ve `plan_eki` ayni sinirlari tasir (contracts tek kaynak). */
export const EK_EN_FAZLA_BAYT = MEDYA_TUR_KURALLARI.odev_eki.azami_boyut_bayt;

export type EkHatasi = 'tur' | 'buyuk' | 'bos';

/** Yuklemeden once istemci on kontrolu; `null` = uygun. */
export function ekDosyasiniDenetle(dosya: Pick<File, 'type' | 'size'>): EkHatasi | null {
  if (!EK_IZINLI_MIME.includes(dosya.type)) return 'tur';
  if (dosya.size <= 0) return 'bos';
  if (dosya.size > EK_EN_FAZLA_BAYT) return 'buyuk';
  return null;
}

/** "1,2 MB" / "340 KB" (Turkce ondalik). */
export function dosyaBoyutuMetni(bayt: number): string {
  if (bayt >= 1024 * 1024) {
    return `${(bayt / (1024 * 1024)).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
  }
  return `${Math.max(1, Math.round(bayt / 1024)).toLocaleString('tr-TR')} KB`;
}

export const ekPdfMi = (mime: string) => mime === 'application/pdf';
