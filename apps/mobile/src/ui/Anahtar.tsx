import { Switch, View } from 'react-native';

import { useTema } from '../tema/TemaSaglayici';
import { Metin } from './Metin';

interface Props {
  etiket: string;
  aciklama?: string;
  deger: boolean;
  onDegis: (v: boolean) => void;
}

/** Etiketli acma/kapama anahtari (en az 44 dp yukseklik). */
export function Anahtar({ etiket, aciklama, deger, onDegis }: Props) {
  const { renkler } = useTema();
  return (
    <View className="min-h-dokunma flex-row items-center gap-3">
      <View className="flex-1">
        <Metin varyant="etiket">{etiket}</Metin>
        {aciklama ? <Metin varyant="kucuk">{aciklama}</Metin> : null}
      </View>
      <Switch
        value={deger}
        onValueChange={onDegis}
        accessibilityLabel={etiket}
        trackColor={{ true: renkler.birincil, false: renkler.kenar }}
      />
    </View>
  );
}
