import { Text, type TextProps } from 'react-native';

const VARYANTLAR = {
  baslik: 'font-kalin text-2xl text-metin',
  altBaslik: 'font-kalin text-lg text-metin',
  govde: 'font-govde text-md text-metin',
  ikincil: 'font-govde text-sm text-metinIkincil',
  etiket: 'font-orta text-sm text-metin',
  kucuk: 'font-govde text-xs text-metinIkincil',
} as const;

export type MetinVaryanti = keyof typeof VARYANTLAR;

interface Props extends TextProps {
  varyant?: MetinVaryanti;
  className?: string;
}

/** Inter yazi tipli metin. Sistem yazi boyutuna saygi duyar ama %150 ile sinirlar. */
export function Metin({ varyant = 'govde', className = '', ...rest }: Props) {
  // className bir metin RENGI veriyorsa varyantin varsayilan rengi atilir (CSS siniflari
  // yazim sirasina gore degil stil sayfasi sirasina gore uygulanir; cakisma olmasin).
  const renkVerildi =
    /(^|\s)text-(?!xs\b|sm\b|md\b|lg\b|xl\b|2xl\b|3xl\b|center\b|left\b|right\b)/.test(className);
  const taban = renkVerildi
    ? VARYANTLAR[varyant].replace(/\btext-(?!xs|sm|md|lg|xl|2xl|3xl)\w+/, '')
    : VARYANTLAR[varyant];
  return <Text maxFontSizeMultiplier={1.5} className={`${taban} ${className}`} {...rest} />;
}
