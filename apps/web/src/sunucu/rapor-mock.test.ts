import {
  DersRaporOzetSema,
  HesapRaporOgrencilerSema,
  HesapRaporOzetSema,
  ModulAyarlariYanitSema,
  OgrenmeRaporOzetSema,
  RaporOdevListeSema,
  RaporOgrenciOraniListeSema,
  RaporSoruListeSema,
} from '@kopru/contracts';
import { describe, expect, it } from 'vitest';

import { raporMock } from './rapor-mock';
import type { MockIstek } from './vekil';

const istek = (
  kurum: string,
  yol: string,
  sorgu = '',
  yontem = 'GET',
  govde?: unknown,
): MockIstek => ({
  yontem,
  yol: `kurumlar/${kurum}/${yol}`,
  sorgu: new URLSearchParams(sorgu),
  govde,
  basliklar: {},
});

describe('rapor mock', () => {
  it('yanit sekilleri @kopru/contracts ile ayni (yonetici)', () => {
    const al = (servis: 'hesap' | 'ders' | 'ogrenme', yol: string, sorgu = '') =>
      raporMock(servis, istek('kurum-mavi', yol, sorgu))?.govde;
    expect(() => HesapRaporOzetSema.parse(al('hesap', 'rapor/ozet'))).not.toThrow();
    expect(() => DersRaporOzetSema.parse(al('ders', 'rapor/ozet', 'donem=30'))).not.toThrow();
    expect(() => OgrenmeRaporOzetSema.parse(al('ogrenme', 'rapor/ozet'))).not.toThrow();
    expect(() => HesapRaporOgrencilerSema.parse(al('hesap', 'rapor/ogrenciler'))).not.toThrow();
    for (const ad of ['devam', 'anladim']) {
      expect(() => RaporOgrenciOraniListeSema.parse(al('ders', `rapor/${ad}`))).not.toThrow();
    }
    expect(() => RaporOgrenciOraniListeSema.parse(al('ogrenme', 'rapor/plan'))).not.toThrow();
    expect(() => RaporOdevListeSema.parse(al('ogrenme', 'rapor/odev'))).not.toThrow();
    expect(() => RaporSoruListeSema.parse(al('ogrenme', 'rapor/soru'))).not.toThrow();
  });

  it('ogretmen yalniz atandigi gruplari gorur (kapsam grup); yonetici hepsini', () => {
    const ogr = HesapRaporOzetSema.parse(
      raporMock('hesap', istek('kurum-ege', 'rapor/ozet'))?.govde,
    );
    const yon = HesapRaporOzetSema.parse(
      raporMock('hesap', istek('kurum-mavi', 'rapor/ozet'))?.govde,
    );
    expect(ogr.kapsam).toBe('grup');
    expect(yon.kapsam).toBe('kurum');
    expect(ogr.gruplar.length).toBeLessThan(yon.gruplar.length);
    expect(ogr.gruplar.length).toBeGreaterThan(0);
  });

  it('ogrenci 403; gecersiz donem 400; Excel gercek bayt', () => {
    expect(raporMock('hesap', istek('kurum-atlas', 'rapor/ozet'))?.durum).toBe(403);
    expect(raporMock('hesap', istek('kurum-mavi', 'rapor/ozet', 'donem=14'))?.durum).toBe(400);
    const xlsx = raporMock('ogrenme', istek('kurum-mavi', 'rapor/disa-aktar', 'donem=7'));
    expect(xlsx?.durum).toBe(200);
    expect(xlsx?.ikili?.dosyaAdi).toBe('panel-son-7-gun.xlsx');
    expect(xlsx?.ikili?.bayt.slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));
  });

  it('modul ayari yazilir, okunur ve grup duzeyi ust duzey kapaliyken acilamaz', () => {
    const yaz = (govde: unknown) =>
      raporMock('hesap', istek('kurum-kuzey', 'modul-ayarlari', '', 'PUT', govde));
    expect(yaz({ modul_kodu: 'odev', kapsam: 'kurum', acik: false })?.durum).toBe(200);
    const oku = ModulAyarlariYanitSema.parse(
      raporMock('hesap', istek('kurum-kuzey', 'modul-ayarlari'))?.govde,
    );
    expect(oku.kurum_etkin.odev).toBe(false);
    const grup = '00000000-0000-4000-8000-000000000001';
    expect(yaz({ modul_kodu: 'odev', kapsam: 'grup', kapsam_id: grup, acik: true })?.durum).toBe(
      422,
    );
    expect(yaz({ modul_kodu: 'odev', kapsam: 'kurum', acik: null })?.durum).toBe(200);
    expect(yaz({ modul_kodu: 'odev', kapsam: 'grup', kapsam_id: grup, acik: false })?.durum).toBe(
      200,
    );
    // Ogretmen kurumu yazamaz.
    expect(
      raporMock(
        'hesap',
        istek('kurum-ege', 'modul-ayarlari', '', 'PUT', {
          modul_kodu: 'odev',
          kapsam: 'kurum',
          acik: false,
        }),
      )?.durum,
    ).toBe(403);
  });
});
