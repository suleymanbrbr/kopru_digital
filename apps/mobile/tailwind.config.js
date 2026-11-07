/**
 * Tema @kopru/ui-tokens'tan uretilir: renk adlari ThemeColors anahtarlaridir ve CSS degiskenine
 * baglanir (--renk-<kebab>). Degiskenlerin degerleri calisma aninda TemaSaglayici tarafindan
 * (acik/koyu + kurum vurgusu) atanir; bkz. src/tema/degiskenler.ts.
 * NativeWind rem'i 14px sayar; bu yuzden olcekler px olarak yazilir.
 */
const { themes, spacing, radius, typography, minTouchTarget } = require('@kopru/ui-tokens');

/** @param {string} s */
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const renkAnahtarlari = [...Object.keys(themes.acik), 'vurguUzeri'];
const colors = Object.fromEntries(
  renkAnahtarlari.map((k) => [k, `rgb(var(--renk-${kebab(k)}) / <alpha-value>)`]),
);

const px = (n) => `${n}px`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    colors: { transparent: 'transparent', ...colors },
    spacing: {
      px: '1px',
      // token olceginde olmayan, bilesenlerde kullanilan ek olculer (28/36/44/56 px)
      7: '28px',
      9: '36px',
      11: '44px',
      14: '56px',
      ...Object.fromEntries(Object.entries(spacing).map(([k, v]) => [k, px(v)])),
    },
    borderRadius: {
      none: '0px',
      ...Object.fromEntries(Object.entries(radius).map(([k, v]) => [k, px(v)])),
    },
    fontSize: Object.fromEntries(
      Object.entries(typography.boyut).map(([k, v]) => [
        k,
        [px(v), { lineHeight: px(Math.round(v * 1.4)) }],
      ]),
    ),
    fontFamily: {
      govde: ['Inter_400Regular'],
      orta: ['Inter_500Medium'],
      kalin: ['Inter_700Bold'],
    },
    extend: {
      minHeight: { dokunma: px(minTouchTarget) },
      minWidth: { dokunma: px(minTouchTarget) },
    },
  },
  plugins: [],
};
