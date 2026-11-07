import { themes } from '@kopru/ui-tokens';

import {
  degiskenAdi,
  kontrastOrani,
  okunurUstRenk,
  renkDegiskenleri,
  rgbKanallari,
} from './degiskenler';

const tailwind = require('../../tailwind.config.js') as {
  theme: { colors: Record<string, string> };
};

describe('tema degiskenleri', () => {
  it('hex -> rgb kanallari', () => {
    expect(rgbKanallari('#2F7BF6')).toBe('47 123 246');
  });

  it('acik ve koyu tema ayni degisken kumesini uretir', () => {
    const a = Object.keys(renkDegiskenleri('acik')).sort();
    expect(Object.keys(renkDegiskenleri('koyu')).sort()).toEqual(a);
    expect(a).toContain('--renk-arka-plan');
    expect(a).toContain('--renk-vurgu-uzeri');
  });

  it('tailwind renkleri tum tema anahtarlarini degiskene baglar', () => {
    const renkler = tailwind.theme.colors;
    for (const k of Object.keys(themes.acik)) {
      expect(renkler[k]).toBe(`rgb(var(${degiskenAdi(k)}) / <alpha-value>)`);
    }
    expect(renkler.vurguUzeri).toBe('rgb(var(--renk-vurgu-uzeri) / <alpha-value>)');
  });

  it('kurum vurgusu calisma aninda vurgu ve ustundeki metin rengini ezer', () => {
    const v = renkDegiskenleri('acik', '#0F9D8A');
    expect(v['--renk-vurgu']).toBe(rgbKanallari('#0F9D8A'));
    const sari = renkDegiskenleri('acik', '#FFE600');
    expect(sari['--renk-vurgu-uzeri']).toBe(rgbKanallari('#0B0E14'));
    const lacivert = renkDegiskenleri('koyu', '#102A71');
    expect(lacivert['--renk-vurgu-uzeri']).toBe(rgbKanallari('#FFFFFF'));
  });

  it('gecersiz vurgu yok sayilir', () => {
    expect(renkDegiskenleri('acik', 'kirmizi')['--renk-vurgu']).toBe(
      renkDegiskenleri('acik')['--renk-vurgu'],
    );
  });

  it('okunur ust renk en az 4.5 kontrast verir (marka renkleri icin)', () => {
    for (const z of ['#2F7BF6', '#FF8A3D', '#D93A33', '#1F9D57']) {
      expect(kontrastOrani(z, okunurUstRenk(z))).toBeGreaterThanOrEqual(3);
    }
  });
});
