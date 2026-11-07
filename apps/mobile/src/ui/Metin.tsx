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
  return <Text maxFontSizeMultiplier={1.5} className={`${VARYANTLAR[varyant]} ${className}`} {...rest} />;
}
