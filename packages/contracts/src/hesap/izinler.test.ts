import { describe, expect, it } from 'vitest';

import {
  IZINLER,
  IZIN_KODLARI,
  IZIN_SOZLUGU_SURUMU,
  ROLLER,
  ROL_IZINLERI,
  izinKapsami,
  izinModulu,
  izinVarMi,
  kapsamYeterli,
} from './izinler.js';

describe('izin sozlugu', () => {
  it('her rol esleme anahtari tanimli bir izindir', () => {
    for (const rol of ROLLER) {
      for (const izin of Object.keys(ROL_IZINLERI[rol])) expect(IZIN_KODLARI).toContain(izin);
    }
  });

  it('sahip tum izinlere kurum kapsaminda sahiptir; yonetici rol.yonet ve kurum.kapat haric', () => {
    expect(IZIN_KODLARI.every((k) => izinKapsami('sahip', k) === 'kurum')).toBe(true);
    expect(izinKapsami('yonetici', 'rol.yonet')).toBeNull();
    expect(izinKapsami('yonetici', 'modul.ayar.yaz')).toBe('kurum');
  });

  it('kapsam genisligi: kendi < grup < sube < kurum', () => {
    expect(kapsamYeterli('kurum', 'grup')).toBe(true);
    expect(kapsamYeterli('grup', 'kurum')).toBe(false);
    expect(izinVarMi('ogretmen', 'yoklama.yaz', 'grup')).toBe(true);
    expect(izinVarMi('ogretmen', 'yoklama.yaz', 'kurum')).toBe(false);
    expect(izinVarMi('ogrenci', 'modul.ayar.yaz')).toBe(false);
  });

  it('izin -> modul eslemesi: cekirdek izinler modulsuz', () => {
    expect(izinModulu('kurum.oku')).toBeNull();
    expect(izinModulu('finans.tahsilat.yaz')).toBe('finans');
    expect(Object.keys(IZINLER)).toHaveLength(IZIN_KODLARI.length);
  });

  it('finans izinleri: ogretmen grup kapsaminda satar/tahsil eder, sablon yonetemez; ogrenci yalniz kendi', () => {
    expect(IZIN_SOZLUGU_SURUMU).toBe(4);
    expect(izinKapsami('ogretmen', 'finans.oku')).toBe('grup');
    expect(izinKapsami('ogretmen', 'finans.tahsilat.yaz')).toBe('grup');
    expect(izinKapsami('ogretmen', 'finans.paket.yaz')).toBeNull();
    expect(izinKapsami('yonetici', 'finans.paket.yaz')).toBe('kurum');
    expect(izinKapsami('sahip', 'finans.paket.yaz')).toBe('kurum');
    expect(izinKapsami('ogrenci', 'finans.oku')).toBe('kendi');
    expect(izinKapsami('ogrenci', 'finans.tahsilat.yaz')).toBeNull();
    expect(izinKapsami('ogrenci', 'finans.paket.yaz')).toBeNull();
    expect(izinKapsami('veli', 'finans.oku')).toBeNull();
    expect(izinModulu('finans.paket.yaz')).toBe('finans');
  });
});
