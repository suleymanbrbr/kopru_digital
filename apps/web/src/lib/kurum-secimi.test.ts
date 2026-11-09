import { describe, expect, it } from 'vitest';

import { secilebilirUyelikler, secimiAtla, tercihEdilenUyelik } from './kurum-secimi';

import type { Uyelik } from '@/oturum/tipler';

const u = (
  id: string,
  kurumId: string,
  rol: Uyelik['rol'],
  kurumTur: Uyelik['kurumTur'],
): Uyelik => ({
  id,
  kurumId,
  kurumAd: kurumId,
  rol,
  kurumTur,
  vurguRengi: null,
});

describe('kurum secimi', () => {
  const soloOgretmen = u('1', 'solo', 'ogretmen', 'bireysel');
  const soloSahip = u('2', 'solo', 'sahip', 'bireysel');

  it('bireysel kurumda kurum basina tek satir: sahip uyeligi (siradan bagimsiz)', () => {
    expect(secilebilirUyelikler([soloOgretmen, soloSahip])).toEqual([soloSahip]);
    expect(secilebilirUyelikler([soloSahip, soloOgretmen])).toEqual([soloSahip]);
  });

  it('diger kurumlarda her uyelik ayri satir kalir, sira korunur', () => {
    const a = u('3', 'kurum', 'ogretmen', 'kurum');
    const b = u('4', 'kurum', 'ogrenci', 'kurum');
    const bilinmeyen = u('5', 'eski', 'ogrenci', undefined);
    expect(secilebilirUyelikler([a, soloOgretmen, b, soloSahip, bilinmeyen])).toEqual([
      a,
      soloSahip,
      b,
      bilinmeyen,
    ]);
  });

  it('tercih edilen uyelik bireysel kurumda sahiptir', () => {
    expect(tercihEdilenUyelik([soloOgretmen, soloSahip], 'solo')?.rol).toBe('sahip');
    expect(tercihEdilenUyelik([soloOgretmen, soloSahip], 'yok')).toBeUndefined();
  });

  it('secim ekrani yalniz tek bireysel kurumda atlanir', () => {
    expect(secimiAtla([soloOgretmen, soloSahip])).toEqual(soloSahip);
    expect(secimiAtla([soloSahip, u('3', 'kurum', 'ogretmen', 'kurum')])).toBeNull();
    expect(secimiAtla([u('3', 'kurum', 'ogretmen', 'kurum')])).toBeNull();
    expect(secimiAtla([])).toBeNull();
  });
});
