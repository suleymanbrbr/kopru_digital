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
