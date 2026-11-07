import { MODUL_KODLARI, type ModulKodu } from '@kopru/contracts';
import { describe, expect, it } from 'vitest';

import { createT, type Messages, t, tr } from './index.js';

describe('t', () => {
  it('anahtari metne cevirir', () => {
    expect(t('ortak.kaydet')).toBe('Kaydet');
  });

  it('degiskenleri doldurur', () => {
    const messages: Messages = { ...tr, ortak: { ...tr.ortak, kaydet: 'Merhaba {ad}' } };
    expect(createT(messages)('ortak.kaydet', { ad: 'Ayşe' })).toBe('Merhaba Ayşe');
  });
});

describe('modul adlari', () => {
  it('anahtarlar @kopru/contracts MODUL_KODLARI ile birebir ayni', () => {
    const adlar: Record<ModulKodu, string> = tr.modul;
    expect(Object.keys(adlar).sort()).toEqual([...MODUL_KODLARI].sort());
  });
});
