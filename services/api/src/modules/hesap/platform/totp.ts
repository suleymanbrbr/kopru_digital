import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Platform kullanicilari icin kucuk bir TOTP (RFC 6238, SHA-1, 6 hane, 30 sn) uygulamasi.
 *
 * Neden better-auth `twoFactor` eklentisi degil: eklenti giris akisina (cerez/oturum donusu,
 * `twoFactorRedirect`) mudahale eder ve butun kullanicilarin giris yolunu etkiler; bizim modelimiz
 * "ayni oturum + `/platform/*` icin ikinci adim" oldugu icin yalniz platform uclarina baglidir
 * (ADR 0004). Burada yalniz platform kullanicilari icin kucuk, test edilmis bir cozum var.
 */

const ADIM_SN = 30;
const HANE = 6;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Kodla(bayt: Buffer): string {
  let bit = 0;
  let deger = 0;
  let cikti = '';
  for (const b of bayt) {
    deger = ((deger << 8) | b) & 0xffff;
    bit += 8;
    while (bit >= 5) {
      cikti += BASE32.charAt((deger >>> (bit - 5)) & 31);
      bit -= 5;
    }
  }
  if (bit > 0) cikti += BASE32.charAt((deger << (5 - bit)) & 31);
  return cikti;
}

export function base32Coz(metin: string): Buffer {
  let bit = 0;
  let deger = 0;
  const baytlar: number[] = [];
  for (const ch of metin.toUpperCase().replace(/=+$/, '')) {
    const i = BASE32.indexOf(ch);
    if (i < 0) throw new Error('geçersiz base32');
    deger = ((deger << 5) | i) & 0xffff;
    bit += 5;
    if (bit >= 8) {
      baytlar.push((deger >>> (bit - 8)) & 255);
      bit -= 8;
    }
  }
  return Buffer.from(baytlar);
}

/** Yeni 160 bitlik TOTP sirri. */
export const yeniSir = (): Buffer => randomBytes(20);

export function totpKodu(sir: Buffer, sayac: number): string {
  const mesaj = Buffer.alloc(8);
  mesaj.writeBigUInt64BE(BigInt(sayac));
  const ozet = createHmac('sha1', sir).update(mesaj).digest();
  const ofset = (ozet[ozet.length - 1] ?? 0) & 0x0f;
  const sayi =
    (((ozet[ofset] ?? 0) & 0x7f) << 24) |
    ((ozet[ofset + 1] ?? 0) << 16) |
    ((ozet[ofset + 2] ?? 0) << 8) |
    (ozet[ofset + 3] ?? 0);
  return String(sayi % 10 ** HANE).padStart(HANE, '0');
}

export const sayacHesapla = (simdi: Date): number => Math.floor(simdi.getTime() / 1000 / ADIM_SN);

function sabitZamanliEsit(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let fark = 0;
  for (let i = 0; i < a.length; i++) fark |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return fark === 0;
}

/**
 * Kodu dogrular (+-1 adim saat sapmasi payi). Eslesen adimin sayacini doner; `sonSayac` ve oncesi
 * yeniden kullanim sayilir (tekrar oynatma korumasi) ve reddedilir.
 */
export function totpDogrula(
  sir: Buffer,
  kod: string,
  simdi: Date,
  sonSayac: number | null,
): number | null {
  const merkez = sayacHesapla(simdi);
  for (const fark of [0, -1, 1]) {
    const sayac = merkez + fark;
    if (sonSayac !== null && sayac <= sonSayac) continue;
    if (sabitZamanliEsit(totpKodu(sir, sayac), kod)) return sayac;
  }
  return null;
}

export function otpauthUri(sir: Buffer, hesapAdi: string, yayinci = 'Köprü'): string {
  const etiket = encodeURIComponent(`${yayinci}:${hesapAdi}`);
  const sorgu = new URLSearchParams({
    secret: base32Kodla(sir),
    issuer: yayinci,
    algorithm: 'SHA1',
    digits: String(HANE),
    period: String(ADIM_SN),
  });
  return `otpauth://totp/${etiket}?${sorgu.toString()}`;
}

const YEDEK_ALFABE = 'abcdefghjkmnpqrstuvwxyz23456789';
const YEDEK_ADET = 10;

/** `xxxxx-xxxxx` bicimli tek kullanimlik yedek kodlar. */
export function yedekKodlariUret(adet = YEDEK_ADET): string[] {
  const parca = () =>
    Array.from(randomBytes(5), (b) => YEDEK_ALFABE[b % YEDEK_ALFABE.length]).join('');
  return Array.from({ length: adet }, () => `${parca()}-${parca()}`);
}

export const yedekKodunuNormallestir = (kod: string): string =>
  kod.trim().toLowerCase().replace(/[\s-]/g, '');

/** Sirri ve yedek kod ozetlerini saklamak icin sunucu sirrindan turetilmis anahtarlar. */
export class IkinciAdimKasasi {
  private readonly sifrelemeAnahtari: Buffer;
  private readonly ozetAnahtari: Buffer;

  constructor(sunucuSirri: string) {
    this.sifrelemeAnahtari = Buffer.from(
      hkdfSync('sha256', sunucuSirri, 'kopru-api', 'platform-ikinci-adim-sir', 32),
    );
    this.ozetAnahtari = Buffer.from(
      hkdfSync('sha256', sunucuSirri, 'kopru-api', 'platform-yedek-kod-ozeti', 32),
    );
  }

  sifrele(sir: Buffer): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.sifrelemeAnahtari, iv);
    const veri = Buffer.concat([cipher.update(sir), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), veri]);
  }

  coz(veri: Buffer): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', this.sifrelemeAnahtari, veri.subarray(0, 12));
    decipher.setAuthTag(veri.subarray(12, 28));
    return Buffer.concat([decipher.update(veri.subarray(28)), decipher.final()]);
  }

  yedekKodOzeti(kod: string): string {
    return createHmac('sha256', this.ozetAnahtari)
      .update(yedekKodunuNormallestir(kod))
      .digest('hex');
  }
}
