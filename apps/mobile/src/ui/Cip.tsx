import { Pressable } from 'react-native';

import { useTema } from '../tema/TemaSaglayici';
import { Ikon } from './Ikon';
import { Metin } from './Metin';

interface Props {
  etiket: string;
  secili: boolean;
  onPress: () => void;
  testID?: string;
}

/**
 * Suzgec cipi (tek secimli grubun ogesi). Secili durum renk + onay ikonu + `selected`
 * erisilebilirlik durumuyla gosterilir: renk tek sinyal degildir. En az 44 dp dokunma hedefi.
 */
export function Cip({ etiket, secili, onPress, testID }: Props) {
  const { renkler } = useTema();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiket}
      accessibilityState={{ selected: secili }}
      testID={testID}
      onPress={onPress}
      className={`min-h-dokunma flex-row items-center gap-1 rounded-tam border px-4 py-2 active:opacity-80 ${
        secili ? 'border-birincil bg-yuzeyIkincil' : 'border-kenar bg-yuzey'
      }`}
    >
      {secili ? <Ikon ad="checkmark" boyut={16} renk={renkler.birincil} /> : null}
      <Metin varyant="etiket">{etiket}</Metin>
    </Pressable>
  );
}
