import { errorCodes, type ErrorResponse } from '@kopru/contracts';

/** Servislerin standart hata govdesi (`@kopru/contracts`) mi? */
export function hataGovdesiMi(value: unknown): value is ErrorResponse {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const { error } = value;
  if (typeof error !== 'object' || error === null) return false;
  const e = error as Record<string, unknown>;
  return typeof e.code === 'string' && typeof e.message === 'string';
}

/** Istemcinin firlattigi hata: durum kodu, makine kodu ve kullaniciya gosterilebilir mesaj. */
export class ApiHatasi extends Error {
  constructor(
    public readonly durum: number,
    public readonly kod: string,
    mesaj: string,
    public readonly istekId?: string,
    public readonly ayrintilar?: unknown,
  ) {
    super(mesaj);
    this.name = 'ApiHatasi';
  }

  /** Servis hata govdesinden (veya bilinmeyen govdeden) hata uretir. */
  static from(durum: number, govde: unknown, yedekMesaj: string): ApiHatasi {
    if (hataGovdesiMi(govde)) {
      const { code, message, requestId, details } = govde.error;
      return new ApiHatasi(durum, code, message, requestId, details);
    }
    const kod = durum === 401 ? errorCodes.unauthorized : errorCodes.internal;
    return new ApiHatasi(durum, kod, yedekMesaj);
  }
}
