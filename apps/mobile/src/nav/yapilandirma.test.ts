import { MODUL_KODLARI } from '@kopru/contracts';

import type { MobilRol } from '../api/tipler';
import {
  ROL_SEKMELERI,
  TUM_SEKME_ADLARI,
  gorunenSekmeler,
  kurumGirisiVarMi,
  modulAcikMi,
} from './yapilandirma';

const hepsiAcik = Object.fromEntries(MODUL_KODLARI.map((m) => [m, true]));
const adlar = (rol: MobilRol, m = hepsiAcik) => gorunenSekmeler(rol, m).map((s) => s.ad);

describe('rol -> sekme yapilandirmasi', () => {
  it('ogretmen sekmeleri', () => {
    expect(adlar('ogretmen')).toEqual(['bugun', 'dersler', 'ogrenciler', 'sorular', 'profil']);
  });

  it('ogrenci sekmeleri', () => {
    expect(adlar('ogrenci')).toEqual(['bugun', 'gorevler', 'soru-sor', 'karakterim', 'profil']);
  });

  it('sahip ve yonetici ogretmen sekmelerini paylasir', () => {
    expect(adlar('sahip')).toEqual(adlar('ogretmen'));
    expect(adlar('yonetici')).toEqual(adlar('ogretmen'));
  });

  it('kapali modulun sekmesi gizlenir, cekirdek sekmeler kalir', () => {
    expect(adlar('ogrenci', { ...hepsiAcik, soru_sor: false })).toEqual([
      'bugun',
      'gorevler',
      'karakterim',
      'profil',
    ]);
    expect(adlar('ogretmen', { takvim: false })).toEqual(['bugun', 'ogrenciler', 'profil']);
  });

  it('modul bilgisi yoksa kapali sayilir (fail-closed), cekirdek her zaman acik', () => {
    expect(modulAcikMi({}, 'odev')).toBe(false);
    expect(modulAcikMi({}, 'cekirdek')).toBe(true);
    expect(adlar('ogrenci', {})).toEqual(['bugun', 'profil']);
  });

  it('her sekme bir modul anahtari tasir ve rota dosyasi listesinde vardir', () => {
    for (const sekmeler of Object.values(ROL_SEKMELERI)) {
      for (const s of sekmeler) {
        const kodlar = typeof s.modul === 'string' ? [s.modul] : s.modul;
        expect(kodlar.every((k) => k === 'cekirdek' || MODUL_KODLARI.includes(k))).toBe(true);
        expect(TUM_SEKME_ADLARI).toContain(s.ad);
      }
    }
  });

  it('Gorevler sekmesi odev, haftalik plan ya da deneme modullerinden biri aciksa gorunur', () => {
    const hepsiKapali = { ...hepsiAcik, odev: false, haftalik_plan: false, deneme: false };
    expect(adlar('ogrenci', hepsiKapali)).not.toContain('gorevler');
    expect(adlar('ogrenci', { ...hepsiKapali, haftalik_plan: true })).toContain('gorevler');
    expect(adlar('ogrenci', { ...hepsiKapali, deneme: true })).toContain('gorevler');
    expect(adlar('ogrenci', { ...hepsiKapali, odev: true })).toContain('gorevler');
  });

  it('Kurum girisi yalnizca sahip ve yoneticide', () => {
    expect(kurumGirisiVarMi('sahip')).toBe(true);
    expect(kurumGirisiVarMi('yonetici')).toBe(true);
    expect(kurumGirisiVarMi('ogretmen')).toBe(false);
    expect(kurumGirisiVarMi('ogrenci')).toBe(false);
  });
});
