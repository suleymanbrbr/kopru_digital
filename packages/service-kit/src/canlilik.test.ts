import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { canlilikDosyasiBaslat } from './canlilik.js';

describe('canlilikDosyasiBaslat', () => {
  const dizin = mkdtempSync(join(tmpdir(), 'canlilik-'));
  afterEach(() => {
    rmSync(dizin, { recursive: true, force: true });
  });

  it('dosyayi olusturur ve durdurulunca siler', () => {
    const dosya = join(dizin, 'canli');
    const durdur = canlilikDosyasiBaslat(dosya);
    expect(statSync(dosya).isFile()).toBe(true);
    durdur();
    expect(existsSync(dosya)).toBe(false);
  });

  it('saglikli degilken dokunmaz', () => {
    const dosya = join(dizin, 'canli2');
    const durdur = canlilikDosyasiBaslat(dosya, () => false);
    expect(existsSync(dosya)).toBe(false);
    durdur();
  });
});
