/**
 * Ortak tasarim degerleri. Web (Tailwind tema degiskenleri) ve mobil (NativeWind) bu
 * paketten beslenir; marka rengi kurum ayarindaki vurgu rengiyle calisma aninda ezilebilir.
 * Renkler gecici marka paletidir; tasarim sistemi kesinlesince guncellenecek.
 */

export const palette = {
  marka: {
    50: '#EEF6FF',
    100: '#D9EAFF',
    300: '#8EC1FF',
    500: '#2F7BF6',
    600: '#1F63D6',
    700: '#1A4FAD',
    900: '#132F63',
  },
  vurgu: { 300: '#FFC38A', 500: '#FF8A3D', 700: '#C85A12' },
  basari: { 100: '#DDF5E6', 500: '#1F9D57', 700: '#14703D' },
  uyari: { 100: '#FFF1D6', 500: '#E0A100', 700: '#9A6B00' },
  hata: { 100: '#FDE2E1', 300: '#F2847E', 500: '#D93A33', 700: '#A12520' },
  notr: {
    0: '#FFFFFF',
    50: '#F7F8FA',
    100: '#EEF0F3',
    200: '#DDE1E7',
    400: '#9AA3B2',
    600: '#5B6577',
    800: '#2A3140',
    900: '#161B26',
    1000: '#0B0E14',
  },
} as const;

export interface ThemeColors {
  arkaPlan: string;
  yuzey: string;
  yuzeyIkincil: string;
  kenar: string;
  metin: string;
  metinIkincil: string;
  birincil: string;
  birincilUzeri: string;
  vurgu: string;
  basari: string;
  uyari: string;
  hata: string;
}

export const themes: Record<'acik' | 'koyu', ThemeColors> = {
  acik: {
    arkaPlan: palette.notr[50],
    yuzey: palette.notr[0],
    yuzeyIkincil: palette.notr[100],
    kenar: palette.notr[200],
    metin: palette.notr[900],
    metinIkincil: palette.notr[600],
    birincil: palette.marka[600],
    birincilUzeri: palette.notr[0],
    vurgu: palette.vurgu[500],
    basari: palette.basari[700],
    uyari: palette.uyari[700],
    hata: palette.hata[700],
  },
  koyu: {
    arkaPlan: palette.notr[1000],
    yuzey: palette.notr[900],
    yuzeyIkincil: palette.notr[800],
    kenar: palette.notr[800],
    metin: palette.notr[50],
    metinIkincil: palette.notr[400],
    birincil: palette.marka[300],
    birincilUzeri: palette.notr[1000],
    vurgu: palette.vurgu[300],
    basari: palette.basari[500],
    uyari: palette.uyari[500],
    hata: palette.hata[300],
  },
};

/** 4 px tabanli bosluk olcegi. */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radius = { kucuk: 6, orta: 10, buyuk: 16, tam: 9999 } as const;

export const typography = {
  fontAilesi: { govde: 'Inter', baslik: 'Inter' },
  boyut: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28, '3xl': 34 },
  agirlik: { normal: '400', orta: '500', kalin: '700' },
} as const;

/** Mobilde dokunma hedefi alt siniri (pt/dp). */
export const minTouchTarget = 44;
