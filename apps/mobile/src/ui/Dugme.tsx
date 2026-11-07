import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';

import { useTema } from '../tema/TemaSaglayici';

import { Metin } from './Metin';

const ZEMIN = {
  birincil: 'bg-birincil',
  vurgu: 'bg-vurgu',
  ikincil: 'bg-yuzeyIkincil',
  hayalet: 'bg-transparent',
  tehlike: 'bg-hata',
} as const;
const YAZI = {
  birincil: 'text-birincilUzeri',
  vurgu: 'text-vurguUzeri',
  ikincil: 'text-metin',
  hayalet: 'text-birincil',
  tehlike: 'text-arkaPlan',
} as const;

interface Props extends Omit<PressableProps, 'children'> {
  etiket: string;
  varyant?: keyof typeof ZEMIN;
  buyuk?: boolean;
  yukleniyor?: boolean;
  className?: string;
}

/** En az 44 dp dokunma hedefi; yukleniyor/devre disi durumlari erisilebilirlik durumuna yansir. */
export function Dugme({
  etiket,
  varyant = 'birincil',
  buyuk = false,
  yukleniyor = false,
  disabled,
  className = '',
  ...rest
}: Props) {
  const { renkler } = useTema();
  const pasif = !!disabled || yukleniyor;
  const spinner = varyant === 'birincil' ? renkler.birincilUzeri : renkler.metin;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiket}
      accessibilityState={{ disabled: pasif, busy: yukleniyor }}
      disabled={pasif}
      className={`min-h-dokunma items-center justify-center rounded-buyuk px-5 active:opacity-80 ${
        buyuk ? 'min-h-12 py-4' : 'py-3'
      } ${ZEMIN[varyant]} ${pasif ? 'opacity-50' : ''} ${className}`}
      {...rest}
    >
      <View className="flex-row items-center gap-2">
        {yukleniyor ? <ActivityIndicator color={spinner} /> : null}
        <Metin
          varyant="etiket"
          className={`${buyuk ? 'text-lg' : 'text-md'} font-kalin ${YAZI[varyant]}`}
        >
          {etiket}
        </Metin>
      </View>
    </Pressable>
  );
}
