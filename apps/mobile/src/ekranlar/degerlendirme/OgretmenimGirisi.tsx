import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Dugme } from '../../ui/Dugme';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { useKaynakOnerilerim } from '../../uygulama/degerlendirme';

/**
 * Ogrenci "Bugun": "Ogretmenim" girisi. Henuz baslamadigi (kendi gunluk kayitlarinda kullanmadigi)
 * oneri sayisini gosterir; sorgu hatasi ya da bos veri karti bozmaz (yalniz giris dugmesi kalir).
 */
export function OgretmenimGirisi() {
  const router = useRouter();
  const oneriler = useKaynakOnerilerim();
  const bekleyen = (oneriler.data ?? []).filter((o) => o.basladi === false).length;
  return (
    <Kart className="gap-3" testID="ogretmenim-girisi">
      <View className="gap-1">
        <Metin varyant="altBaslik" accessibilityRole="header">
          {t('mobil.ogretmenim.baslik')}
        </Metin>
        <Metin varyant="ikincil" testID="ogretmenim-ozet" accessibilityLiveRegion="polite">
          {bekleyen > 0
            ? t('mobil.ogretmenim.bekleyenOneri', { n: bekleyen })
            : t('mobil.ogretmenim.aciklama')}
        </Metin>
      </View>
      <Dugme
        varyant="ikincil"
        etiket={t('mobil.ogretmenim.ac')}
        testID="bugun-ogretmenim"
        onPress={() => {
          router.push('/ogretmenim');
        }}
      />
    </Kart>
  );
}
