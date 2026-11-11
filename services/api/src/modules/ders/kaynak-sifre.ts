import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { kaynakHataKodlari } from '@kopru/contracts';
import { AppError } from '@kopru/service-kit';

/**
 * Kaynak parolasi (Zoom kayit parolasi) uygulama duzeyinde AES-256-GCM ile saklanir; hash degildir cunku
 * yetkili ogrenciye gosterilmesi gerekir. Saklama bicimi: iv (12) || etiket (16) || sifreli metin.
 * Anahtar: `KAYNAK_PAROLA_ANAHTARI` (32 bayt, base64). Yoksa api acilir; parola yazilirken/okunurken 503.
 */

const IV_BAYT = 12;
const ETIKET_BAYT = 16;

/** Anahtar bicimi dogru mu (config dogrulamasi da bunu kullanir). */
export function anahtarCoz(deger: string): Buffer | null {
  const anahtar = Buffer.from(deger, 'base64');
  return anahtar.length === 32 ? anahtar : null;
}

function ortamAnahtari(): Buffer {
  // service-kit oneki kurali: `API_<ANAHTAR>` once, sonra `<ANAHTAR>`.
  const ham = process.env.API_KAYNAK_PAROLA_ANAHTARI ?? process.env.KAYNAK_PAROLA_ANAHTARI;
  const anahtar = ham ? anahtarCoz(ham) : null;
  if (!anahtar) {
    throw new AppError(
      503,
      kaynakHataKodlari.sifrelemeYok,
      'Parola saklama anahtarı tanımlı değil (KAYNAK_PAROLA_ANAHTARI, 32 bayt base64).',
    );
  }
  return anahtar;
}

export function parolaSifrele(parola: string, anahtar: Buffer = ortamAnahtari()): Buffer {
  const iv = randomBytes(IV_BAYT);
  const sifre = createCipheriv('aes-256-gcm', anahtar, iv);
  const metin = Buffer.concat([sifre.update(parola, 'utf8'), sifre.final()]);
  return Buffer.concat([iv, sifre.getAuthTag(), metin]);
}

export function parolaCoz(veri: Buffer, anahtar: Buffer = ortamAnahtari()): string {
  const iv = veri.subarray(0, IV_BAYT);
  const etiket = veri.subarray(IV_BAYT, IV_BAYT + ETIKET_BAYT);
  const metin = veri.subarray(IV_BAYT + ETIKET_BAYT);
  const coz = createDecipheriv('aes-256-gcm', anahtar, iv);
  coz.setAuthTag(etiket);
  return Buffer.concat([coz.update(metin), coz.final()]).toString('utf8');
}
