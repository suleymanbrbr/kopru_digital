import {
  BILDIRIM_KANALLARI,
  BILDIRIM_KATEGORILERI,
  MODUL_KODLARI,
  PLATFORM_ROLLERI,
  PlatformMesajOnemSema,
  type ModulKodu,
} from '@kopru/contracts';
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

describe('bildirim adlari', () => {
  it('kategori ve kanal anahtarlari @kopru/contracts ile birebir ayni', () => {
    expect(Object.keys(tr.bildirim.kategori).sort()).toEqual([...BILDIRIM_KATEGORILERI].sort());
    expect(Object.keys(tr.bildirim.kanal).sort()).toEqual([...BILDIRIM_KANALLARI].sort());
  });
});

describe('platform adlari', () => {
  it('rol ve mesaj onemi anahtarlari @kopru/contracts ile birebir ayni', () => {
    expect(Object.keys(tr.platform.rol).sort()).toEqual([...PLATFORM_ROLLERI].sort());
    expect(Object.keys(tr.platform.mesajOnem).sort()).toEqual(
      [...PlatformMesajOnemSema.options].sort(),
    );
  });
});
