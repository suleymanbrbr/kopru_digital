import { t } from '@kopru/i18n';
import { Pressable, TextInput, View } from 'react-native';

import { sayiAyikla, sayiDegistir } from '../../gunluk/kurallar';
import { useTema } from '../../tema/TemaSaglayici';
import { Ikon } from '../../ui/Ikon';
import { Metin } from '../../ui/Metin';

type Tur = 'dogru' | 'yanlis' | 'bos';

const IKON = {
  dogru: 'checkmark-circle',
  yanlis: 'close-circle',
  bos: 'remove-circle-outline',
} as const;

interface Props {
  tur: Tur;
  deger: number;
  onDegis: (n: number) => void;
}

/**
 * Doğru / Yanlış / Boş sayı girişi: büyük (56 dp) dokunmatik eksi/artı düğmeleri ve klavyeyle
 * doğrudan yazılabilen sayı alanı. Renk tek sinyal değildir: ikon + ad her satırda vardır.
 */
export function SayiGirisi({ tur, deger, onDegis }: Props) {
  const { renkler } = useTema();
  const ad = t(`mobil.gunluk.form.${tur}`);
  const renk =
    tur === 'dogru' ? renkler.basari : tur === 'yanlis' ? renkler.hata : renkler.metinIkincil;
  const dugme =
    'h-14 w-14 items-center justify-center rounded-buyuk bg-yuzeyIkincil active:opacity-70';
  return (
    <View className="flex-row items-center gap-3" testID={`sayi-${tur}`}>
      <View className="min-w-20 flex-1 flex-row items-center gap-2">
        <Ikon ad={IKON[tur]} boyut={24} renk={renk} />
        <Metin varyant="altBaslik" className="flex-shrink">
          {ad}
        </Metin>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('mobil.gunluk.form.azalt', { ad })}
        accessibilityState={{ disabled: deger <= 0 }}
        disabled={deger <= 0}
        testID={`sayi-${tur}-azalt`}
        onPress={() => {
          onDegis(sayiDegistir(deger, -1));
        }}
        className={`${dugme} ${deger <= 0 ? 'opacity-40' : ''}`}
      >
        <Ikon ad="remove" boyut={28} />
      </Pressable>
      <TextInput
        accessibilityLabel={t('mobil.gunluk.form.sayiAlani', { ad })}
        testID={`sayi-${tur}-girdi`}
        value={String(deger)}
        onChangeText={(m) => {
          onDegis(sayiAyikla(m));
        }}
        keyboardType="number-pad"
        returnKeyType="done"
        maxLength={3}
        selectTextOnFocus
        maxFontSizeMultiplier={1.3}
        className="h-14 w-20 rounded-orta border border-kenar bg-yuzey text-center font-kalin text-2xl text-metin"
        style={{ color: renkler.metin }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('mobil.gunluk.form.arttir', { ad })}
        testID={`sayi-${tur}-arttir`}
        onPress={() => {
          onDegis(sayiDegistir(deger, 1));
        }}
        className={dugme}
      >
        <Ikon ad="add" boyut={28} />
      </Pressable>
    </View>
  );
}
