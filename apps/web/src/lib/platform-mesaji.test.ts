import { beforeEach, describe, expect, it } from 'vitest';

import { kapatilanlariOku, mesajiKapat } from './platform-mesaji';

describe('platform mesaji kapatma', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  it('mesaj kimligine gore hatirlanir, tekrar eklenmez, siniri asmaz', () => {
    expect(kapatilanlariOku()).toEqual([]);
    mesajiKapat('a');
    mesajiKapat('b');
    mesajiKapat('a');
    expect(kapatilanlariOku()).toEqual(['b', 'a']);
    for (let i = 0; i < 30; i++) mesajiKapat(`m${String(i)}`);
    expect(kapatilanlariOku()).toHaveLength(20);
  });
  it('bozuk depolama bos liste sayilir', () => {
    window.localStorage.setItem('kopru.platform-mesaji.kapatilan', '{bozuk');
    expect(kapatilanlariOku()).toEqual([]);
  });
});
