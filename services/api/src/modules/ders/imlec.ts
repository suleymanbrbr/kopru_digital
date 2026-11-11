import { errorCodes } from '@kopru/contracts';
import { AppError } from '@kopru/service-kit';

/**
 * Imleçli sayfalama icin opak imlec: parcalar `|` ile birlestirilip base64url'e cevrilir. Zaman damgasi
 * parcalari tam hassasiyetle (mikrosaniye) metin olarak tasinmali: `Date` milisaniyede kirpar ve ayni
 * milisaniyedeki satirlar sayfa sinirinda atlanir.
 */
export const imlecYaz = (...parcalar: (string | number)[]): string =>
  Buffer.from(parcalar.map(String).join('|'), 'utf8').toString('base64url');

export function imlecCoz(imlec: string, parcaSayisi: number): string[] {
  const parcalar = Buffer.from(imlec, 'base64url').toString('utf8').split('|');
  if (parcalar.length !== parcaSayisi || parcalar.some((p) => p === '')) {
    throw new AppError(400, errorCodes.validation, 'İmleç geçersiz.');
  }
  return parcalar;
}

/** Zaman damgasini mikrosaniye hassasiyetinde ISO metni olarak okumak icin SQL parcasi. */
export const MIKROSANIYE_ISO = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;
