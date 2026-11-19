import { t } from '@kopru/i18n';
import { View } from 'react-native';

import { Metin } from '../../ui/Metin';

interface Props {
  ad: string;
  mevcut: number;
  /** `null`: sinirsiz. */
  ustSinir: number | null;
  testID?: string;
}

/** Kullanim cubugu: dolulugu renge ek olarak "x / y" metniyle de bildirir (%90+ uyari rengi). */
export function KullanimCubugu({ ad, mevcut, ustSinir, testID }: Props) {
  const oran = ustSinir ? Math.min(1, mevcut / ustSinir) : 0;
  const deger =
    ustSinir === null
      ? t('mobil.abonelik.kullanim.degerSinirsiz', { mevcut })
      : t('mobil.abonelik.kullanim.deger', { mevcut, ust: ustSinir });
  const etiket =
    ustSinir === null
      ? t('mobil.abonelik.kullanim.etiketSinirsiz', { ad, mevcut })
      : t('mobil.abonelik.kullanim.etiket', { ad, mevcut, ust: ustSinir });
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={etiket}
      accessibilityValue={
        ustSinir === null
          ? { text: deger }
          : { min: 0, max: ustSinir, now: Math.min(mevcut, ustSinir) }
      }
      className="gap-1"
    >
      <View className="flex-row justify-between">
        <Metin varyant="etiket">{ad}</Metin>
        <Metin varyant="ikincil">{deger}</Metin>
      </View>
      <View className="h-2 overflow-hidden rounded-tam bg-yuzeyIkincil">
        <View
          testID={testID ? `${testID}-dolgu` : undefined}
          className={`h-2 rounded-tam ${oran >= 0.9 ? 'bg-uyari' : 'bg-birincil'}`}
          style={{ width: `${Math.round(oran * 100)}%` }}
        />
      </View>
    </View>
  );
}
