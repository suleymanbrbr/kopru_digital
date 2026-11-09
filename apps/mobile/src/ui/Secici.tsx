import { Pressable, View } from 'react-native';

import { useTema } from '../tema/TemaSaglayici';
import { Ikon } from './Ikon';
import { Metin } from './Metin';

export interface Secenek<T extends string> {
  deger: T;
  etiket: string;
  /** Ekran okuyucu icin daha ayrintili etiket. */
  erisilebilirlikEtiketi?: string;
}

interface Props<T extends string> {
  baslik?: string;
  secenekler: readonly Secenek<T>[];
  deger: T | null;
  onDegis: (deger: T) => void;
  /** Secenekler alt alta (uzun etiketler) ya da yan yana (kisa). */
  dikey?: boolean;
}

/**
 * Tek secimli grup (radio). Secili durum renk + onay ikonu + `selected` erisilebilirlik durumuyla
 * gosterilir: renk tek sinyal degildir.
 */
export function Secici<T extends string>({
  baslik,
  secenekler,
  deger,
  onDegis,
  dikey = false,
}: Props<T>) {
  const { renkler } = useTema();
  return (
    <View className="gap-2" accessibilityRole="radiogroup">
      {baslik ? <Metin varyant="etiket">{baslik}</Metin> : null}
      <View className={dikey ? 'gap-2' : 'flex-row flex-wrap gap-2'}>
        {secenekler.map((s) => {
          const secili = s.deger === deger;
          return (
            <Pressable
              key={s.deger}
              accessibilityRole="radio"
              accessibilityLabel={s.erisilebilirlikEtiketi ?? s.etiket}
              accessibilityState={{ selected: secili, checked: secili }}
              onPress={() => {
                onDegis(s.deger);
              }}
              className={`min-h-dokunma flex-row items-center gap-2 rounded-buyuk border px-4 py-3 active:opacity-80 ${
                secili ? 'border-birincil bg-birincil' : 'border-kenar bg-yuzeyIkincil'
              } ${dikey ? 'w-full' : ''}`}
            >
              {secili ? <Ikon ad="checkmark" boyut={18} renk={renkler.birincilUzeri} /> : null}
              <Metin
                varyant="etiket"
                className={`flex-shrink ${secili ? 'text-birincilUzeri' : 'text-metin'}`}
              >
                {s.etiket}
              </Metin>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
