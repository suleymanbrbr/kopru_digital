import { describe, expect, it } from 'vitest';

import { ipIzinListesi } from './ip-izin.js';
import { epostayiMaskele, telefonuMaskele } from './maskele.js';
import { HataSayaci } from './sayac.js';
import {
  IkinciAdimKasasi,
  base32Coz,
  base32Kodla,
  otpauthUri,
  totpDogrula,
  totpKodu,
  yedekKodlariUret,
  yedekKodunuNormallestir,
  yeniSir,
} from './totp.js';

describe('TOTP (RFC 6238)', () => {
  const sir = Buffer.from('12345678901234567890');

  it('RFC 6238 SHA-1 test vektorleri (6 hane = 8 hanenin son 6 hanesi)', () => {
    // T=59 -> 94287082, T=1111111109 -> 07081804, T=2000000000 -> 69279037
    expect(totpKodu(sir, Math.floor(59 / 30))).toBe('287082');
    expect(totpKodu(sir, Math.floor(1_111_111_109 / 30))).toBe('081804');
    expect(totpKodu(sir, Math.floor(2_000_000_000 / 30))).toBe('279037');
  });

  it('base32 gidis donus ve RFC 4648 vektoru', () => {
    expect(base32Kodla(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Coz('MZXW6YTBOI').toString()).toBe('foobar');
    const rastgele = yeniSir();
    expect(base32Coz(base32Kodla(rastgele)).equals(rastgele)).toBe(true);
  });

  it('dogrulama: +-1 adim payi, yeniden kullanim reddedilir', () => {
    const simdi = new Date(59_000);
    const sayac = 1;
    expect(totpDogrula(sir, totpKodu(sir, sayac), simdi, null)).toBe(sayac);
    expect(totpDogrula(sir, totpKodu(sir, sayac + 1), simdi, null)).toBe(sayac + 1);
    expect(totpDogrula(sir, totpKodu(sir, sayac + 2), simdi, null)).toBeNull();
    // aynı adim ikinci kez kullanilamaz
    expect(totpDogrula(sir, totpKodu(sir, sayac), simdi, sayac)).toBeNull();
    expect(totpDogrula(sir, '000000', simdi, null)).toBeNull();
  });

  it('otpauth URI ve yedek kodlar', () => {
    const uri = otpauthUri(sir, 'yonetici-abc');
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain(`secret=${base32Kodla(sir)}`);
    const kodlar = yedekKodlariUret();
    expect(new Set(kodlar).size).toBe(10);
    expect(kodlar.every((k) => /^[a-z2-9]{5}-[a-z2-9]{5}$/.test(k))).toBe(true);
    expect(yedekKodunuNormallestir(' ABCDE-fghjk ')).toBe('abcdefghjk');
  });

  it('kasa: sir sifrelenip cozulur, yedek kod ozeti sabit ve sirra bagli', () => {
    const kasa = new IkinciAdimKasasi('a'.repeat(40));
    const sifreli = kasa.sifrele(sir);
    expect(sifreli.includes(sir)).toBe(false);
    expect(kasa.coz(sifreli).equals(sir)).toBe(true);
    expect(kasa.yedekKodOzeti('abcde-fghjk')).toBe(kasa.yedekKodOzeti(' ABCDEFGHJK '));
    expect(new IkinciAdimKasasi('b'.repeat(40)).yedekKodOzeti('abcde-fghjk')).not.toBe(
      kasa.yedekKodOzeti('abcde-fghjk'),
    );
  });
});

describe('IP izin listesi', () => {
  it('bos liste kisit yok demektir', () => {
    expect(ipIzinListesi([])).toBeNull();
  });
  it('tek IP ve CIDR (IPv4/IPv6, IPv4-mapped)', () => {
    const izinli = ipIzinListesi(['203.0.113.0/24', '198.51.100.7', '2001:db8::/32']);
    expect(izinli?.('203.0.113.99')).toBe(true);
    expect(izinli?.('198.51.100.7')).toBe(true);
    expect(izinli?.('198.51.100.8')).toBe(false);
    expect(izinli?.('203.0.114.1')).toBe(false);
    expect(izinli?.('2001:db8:1::1')).toBe(true);
    expect(izinli?.('2001:db9::1')).toBe(false);
    expect(izinli?.('::ffff:203.0.113.5')).toBe(true);
    expect(izinli?.('gecersiz')).toBe(false);
  });
});

describe('maskeleme', () => {
  it('telefon ve e-posta yalniz gereken kadar gorunur', () => {
    expect(telefonuMaskele('+905321234567')).toBe('+90 ******** 67');
    expect(telefonuMaskele(null)).toBeNull();
    expect(epostayiMaskele('ayse@ornek.com')).toBe('a***@o***.com');
    expect(epostayiMaskele(null)).toBeNull();
  });
});

describe('HataSayaci', () => {
  it('son pencere icindeki 5xx oranini hesaplar, eski kovalar duser', () => {
    let simdi = 0;
    const sayac = new HataSayaci(60, () => simdi);
    expect(sayac.ozet()).toEqual({ istek: 0, hata5xx: 0, oran: 0 });
    sayac.kaydet(200);
    sayac.kaydet(404);
    sayac.kaydet(500);
    sayac.kaydet(503);
    expect(sayac.ozet()).toEqual({ istek: 4, hata5xx: 2, oran: 0.5 });
    simdi += 61 * 60_000;
    expect(sayac.ozet()).toEqual({ istek: 0, hata5xx: 0, oran: 0 });
    sayac.kaydet(200);
    expect(sayac.ozet().istek).toBe(1);
  });
});
