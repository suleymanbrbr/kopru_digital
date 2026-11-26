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

  it('sahip ogrenciye ozgu yazma izinleri haric tum izinlere kurum kapsaminda sahiptir; yonetici rol.yonet ve kurum.kapat de haric', () => {
    const ogrenciyeOzgu = new Set(['plan.gerceklesen.yaz', 'gunluk_soru.yaz']);
    expect(
      IZIN_KODLARI.filter((k) => !ogrenciyeOzgu.has(k)).every(
        (k) => izinKapsami('sahip', k) === 'kurum',
      ),
    ).toBe(true);
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
    expect(IZIN_SOZLUGU_SURUMU).toBe(12);
    expect(izinKapsami('sahip', 'rapor.oku')).toBe('kurum');
    expect(izinKapsami('yonetici', 'rapor.oku')).toBe('kurum');
    expect(izinKapsami('ogretmen', 'rapor.oku')).toBe('grup');
    expect(izinKapsami('ogrenci', 'rapor.oku')).toBeNull();
    expect(izinKapsami('veli', 'rapor.oku')).toBeNull();
    expect(izinKapsami('ogretmen', 'oyunlastirma.oku')).toBe('grup');
    expect(izinKapsami('ogrenci', 'oyunlastirma.oku')).toBe('kendi');
    expect(izinKapsami('veli', 'oyunlastirma.oku')).toBeNull();
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

  it('plan izinleri: hedefler ogretmen/yonetim, gerceklesen yalniz ogrenci', () => {
    expect(izinKapsami('ogretmen', 'plan.gorev.yaz')).toBe('grup');
    expect(izinKapsami('sahip', 'plan.gorev.yaz')).toBe('kurum');
    expect(izinKapsami('yonetici', 'plan.gorev.yaz')).toBe('kurum');
    expect(izinKapsami('ogrenci', 'plan.gorev.yaz')).toBeNull();
    expect(izinKapsami('ogrenci', 'plan.gerceklesen.yaz')).toBe('kendi');
    for (const rol of ['sahip', 'yonetici', 'ogretmen', 'veli'] as const) {
      expect(izinKapsami(rol, 'plan.gerceklesen.yaz')).toBeNull();
    }
    expect(izinKapsami('ogrenci', 'plan.oku')).toBe('kendi');
    expect(izinModulu('plan.gerceklesen.yaz')).toBe('haftalik_plan');
  });

  it('geri bildirim: ogrenci verir, ogretmen grup kapsaminda okur, sahip/yonetici kurum', () => {
    expect(izinKapsami('ogrenci', 'geri_bildirim.ver')).toBe('kendi');
    expect(izinKapsami('ogrenci', 'geri_bildirim.oku')).toBeNull();
    expect(izinKapsami('ogretmen', 'geri_bildirim.ver')).toBeNull();
    expect(izinKapsami('ogretmen', 'geri_bildirim.oku')).toBe('grup');
    expect(izinKapsami('sahip', 'geri_bildirim.oku')).toBe('kurum');
    expect(izinKapsami('yonetici', 'geri_bildirim.oku')).toBe('kurum');
    expect(izinKapsami('veli', 'geri_bildirim.oku')).toBeNull();
    expect(izinModulu('geri_bildirim.oku')).toBe('geri_bildirim');
  });

  it('soru sor: ogrenci sorar, ogretmen grup kapsaminda cevaplar, yonetim yalniz sahip/yonetici', () => {
    expect(izinKapsami('ogrenci', 'soru.sor')).toBe('kendi');
    expect(izinKapsami('ogrenci', 'soru.cevapla')).toBeNull();
    expect(izinKapsami('ogrenci', 'soru.yonet')).toBeNull();
    expect(izinKapsami('ogretmen', 'soru.cevapla')).toBe('grup');
    expect(izinKapsami('ogretmen', 'soru.yonet')).toBeNull();
    expect(izinKapsami('sahip', 'soru.yonet')).toBe('kurum');
    expect(izinKapsami('yonetici', 'soru.yonet')).toBe('kurum');
    expect(izinKapsami('veli', 'soru.yonet')).toBeNull();
    expect(izinModulu('soru.yonet')).toBe('soru_sor');
  });

  it('degerlendirme ve kocluk: personel yazar, ogrenci yalniz kendine gorunen okur, kocluk ogrenciye kapali, veli yok', () => {
    for (const izin of ['degerlendirme.yaz', 'kaynak_onerisi.yaz', 'kocluk.oku'] as const) {
      expect(izinKapsami('sahip', izin)).toBe('kurum');
      expect(izinKapsami('yonetici', izin)).toBe('kurum');
      expect(izinKapsami('ogretmen', izin)).toBe('grup');
      expect(izinKapsami('ogrenci', izin)).toBeNull();
      expect(izinKapsami('veli', izin)).toBeNull();
      expect(izinModulu(izin)).toBeNull();
    }
    for (const izin of ['degerlendirme.oku', 'kaynak_onerisi.oku'] as const) {
      expect(izinKapsami('ogretmen', izin)).toBe('grup');
      expect(izinKapsami('ogrenci', izin)).toBe('kendi');
      expect(izinKapsami('veli', izin)).toBeNull();
    }
  });

  it('abonelik izinleri yalniz sahibindir ve cekirdektir (kapatilamaz)', () => {
    for (const izin of ['abonelik.oku', 'abonelik.yonet'] as const) {
      expect(izinKapsami('sahip', izin)).toBe('kurum');
      for (const rol of ['yonetici', 'ogretmen', 'ogrenci', 'veli'] as const) {
        expect(izinKapsami(rol, izin)).toBeNull();
      }
      expect(izinModulu(izin)).toBeNull();
    }
  });
});
