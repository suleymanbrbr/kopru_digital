import { describe, expect, it } from 'vitest';

import {
  aktivasyonTamam,
  denemeAfisiGun,
  faturaFormunuDogrula,
  guvenliYonlendirme,
  kalanGun,
  kullanimOrani,
  kullanimSeviyesi,
  odemeSonucuCoz,
  planLimitiDetayi,
  tcknGecerliMi,
  vergiNoGecerliMi,
  vknGecerliMi,
} from './bicim';
import { donusKurumu } from './donus';

const GUN = 86_400_000;
const SIMDI = Date.parse('2026-11-19T09:00:00Z');

describe('vergi/kimlik numarasi', () => {
  it('gecerli TCKN ve VKN kabul edilir, sağlama basamagi bozulunca reddedilir', () => {
    expect(tcknGecerliMi('10000000146')).toBe(true);
    expect(tcknGecerliMi('10000000147')).toBe(false);
    expect(tcknGecerliMi('00000000000')).toBe(false);
    expect(vknGecerliMi('1111111114')).toBe(true);
    expect(vknGecerliMi('4792140758')).toBe(true);
    expect(vknGecerliMi('1111111115')).toBe(false);
    expect(vergiNoGecerliMi('10000000146')).toBe(true);
    expect(vergiNoGecerliMi('123456789')).toBe(false);
    expect(vergiNoGecerliMi('12345678901234')).toBe(false);
  });
});

describe('fatura formu dogrulamasi', () => {
  const gecerli = {
    unvan: 'Kuzey Eğitim Ltd.',
    vergiNo: '1111111114',
    vergiDairesi: '',
    satir: 'Moda Cd. 1',
    ilce: 'Kadıköy',
    il: 'İstanbul',
    postaKodu: '',
    eposta: 'fatura@kuzey.test',
    eFatura: false,
  };
  it('gecerli form hatasiz; eksik alanlar isaretlenir', () => {
    expect(faturaFormunuDogrula(gecerli)).toEqual({});
    expect(
      faturaFormunuDogrula({ ...gecerli, unvan: ' ', vergiNo: '1', postaKodu: '123', eposta: 'x' }),
    ).toEqual({ unvan: true, vergiNo: true, postaKodu: true, eposta: true });
    expect(faturaFormunuDogrula({ ...gecerli, satir: '', il: '' })).toEqual({
      adres: true,
      il: true,
    });
  });
});

describe('deneme afisi ve kalan gun', () => {
  const deneme = (gun: number) => ({
    durum: 'deneme' as const,
    deneme_bitis_at: new Date(SIMDI + gun * GUN - 1000).toISOString(),
  });
  it('kalan gun yukari yuvarlanir; afis yalniz 3 gun ve altinda', () => {
    expect(kalanGun(new Date(SIMDI + 2.2 * GUN).toISOString(), SIMDI)).toBe(3);
    expect(kalanGun(new Date(SIMDI - GUN).toISOString(), SIMDI)).toBe(0);
    expect(denemeAfisiGun(deneme(3), SIMDI)).toBe(3);
    expect(denemeAfisiGun(deneme(1), SIMDI)).toBe(1);
    expect(denemeAfisiGun(deneme(4), SIMDI)).toBeNull();
    expect(denemeAfisiGun(deneme(-1), SIMDI)).toBeNull();
    expect(denemeAfisiGun({ durum: 'aktif', deneme_bitis_at: null }, SIMDI)).toBeNull();
    expect(denemeAfisiGun(null, SIMDI)).toBeNull();
  });
});

describe('kullanim cubugu', () => {
  it('oran ve seviye; sinirsizde cubuk yok', () => {
    expect(kullanimOrani(8, 15)).toBe(53);
    expect(kullanimOrani(20, 15)).toBe(100);
    expect(kullanimOrani(3, null)).toBeNull();
    expect(kullanimSeviyesi(15, 15)).toBe('dolu');
    expect(kullanimSeviyesi(12, 15)).toBe('yaklasti');
    expect(kullanimSeviyesi(3, 15)).toBe('normal');
    expect(kullanimSeviyesi(99, null)).toBe('normal');
  });
});

describe('plan_limiti detayi', () => {
  it('gecerli detay doner, bozuk bicim null', () => {
    expect(planLimitiDetayi({ limit: 'max_ogrenci', mevcut: 15, ust_sinir: 15 })).toEqual({
      limit: 'max_ogrenci',
      mevcut: 15,
      ust_sinir: 15,
    });
    expect(planLimitiDetayi({ limit: 'baska', mevcut: 1, ust_sinir: 2 })).toBeNull();
    expect(planLimitiDetayi(undefined)).toBeNull();
  });
});

describe('odeme donusu', () => {
  it('?odeme= degeri ve aktivasyon', () => {
    expect(odemeSonucuCoz('basarili')).toBe('basarili');
    expect(odemeSonucuCoz('bekliyor')).toBe('bekliyor');
    expect(odemeSonucuCoz('x')).toBeNull();
    expect(odemeSonucuCoz(null)).toBeNull();
    expect(aktivasyonTamam({ durum: 'aktif', kaynak: 'iyzico' })).toBe(true);
    expect(aktivasyonTamam({ durum: 'deneme', kaynak: 'deneme' })).toBe(false);
    expect(aktivasyonTamam(null)).toBe(false);
  });

  it('yonlendirme yalniz http(s)', () => {
    expect(guvenliYonlendirme('https://odeme.iyzico.com/x')).toBe('https://odeme.iyzico.com/x');
    expect(guvenliYonlendirme('http://localhost:41730/v1/x?token=a')).not.toBeNull();
    expect(guvenliYonlendirme('javascript:alert(1)')).toBeNull();
    expect(guvenliYonlendirme(null)).toBeNull();
  });

  it('donus kurumu: saklanan sahip kurum > aktif uyelik > tek sahip kurum', () => {
    const u = [
      { id: 'u1', kurumId: 'k1', rol: 'sahip' },
      { id: 'u2', kurumId: 'k2', rol: 'sahip' },
      { id: 'u3', kurumId: 'k3', rol: 'ogretmen' },
    ];
    expect(donusKurumu(u, null, 'k2')).toBe('k2');
    expect(donusKurumu(u, 'u1', 'k3')).toBe('k1');
    expect(donusKurumu(u, null, null)).toBeNull();
    expect(donusKurumu(u.slice(0, 1), null, null)).toBe('k1');
    expect(donusKurumu(u.slice(2), 'u3', null)).toBeNull();
  });
});
