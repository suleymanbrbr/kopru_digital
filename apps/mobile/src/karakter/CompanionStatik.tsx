import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { statikAnahtarlar } from './girdiler';
import { KARAKTER_GORSELLERI } from './gorseller.generated';
import type { TurKodu } from './tipler';

interface Props {
  tur: TurKodu;
  asama: number;
  varyant?: 0 | 1;
  boyut: number;
  /** true ise hafif nefes animasyonu calisir (hareket azaltma kapaliyken). */
  nefes?: boolean;
}

/** Statik yer tutucu gorsel (SVG). Nihai statik WebP'ler gelince yalnizca eslem degisir. */
export function CompanionStatik({ tur, asama, varyant, boyut, nefes = false }: Props) {
  const olcek = useSharedValue(1);

  useEffect(() => {
    if (!nefes) {
      olcek.value = 1;
      return;
    }
    olcek.value = withRepeat(
      withSequence(
        withTiming(1.025, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [nefes, olcek]);

  const stil = useAnimatedStyle(() => ({ transform: [{ scale: olcek.value }] }));

  const anahtar = statikAnahtarlar(tur, asama, varyant).find((k) => k in KARAKTER_GORSELLERI);
  const Gorsel = anahtar ? KARAKTER_GORSELLERI[anahtar] : undefined;
  if (!Gorsel) return <View style={{ width: boyut, height: boyut }} />;

  return (
    <Animated.View style={[{ width: boyut, height: boyut }, stil]}>
      <Gorsel width={boyut} height={boyut} />
    </Animated.View>
  );
}
