import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Ikon } from '../../ui/Ikon';
import { Metin } from '../../ui/Metin';
import { useOkunmamisSayisi } from '../../uygulama/bildirim';

/**
 * Bugun ekraninin ust cubugundaki zil: okunmamis sayisini rozetle gosterir ve gelen kutusunu acar.
 * Uygulama simgesi rozeti de bu sayiya esitlenir (Bugun her zaman acik ilk ekrandir).
 */
export function BildirimZili() {
  const router = useRouter();
  const sorgu = useOkunmamisSayisi(true);
  const sayi = sorgu.data ?? 0;
  const metin = sayi > 99 ? '99+' : String(sayi);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        sayi > 0 ? t('mobil.bildirim.zilOkunmamis', { n: sayi }) : t('mobil.bildirim.zil')
      }
      testID="bildirim-zili"
      hitSlop={8}
      onPress={() => {
        router.push('/bildirimler');
      }}
      className="min-h-dokunma min-w-dokunma items-center justify-center active:opacity-70"
    >
      <Ikon ad={sayi > 0 ? 'notifications' : 'notifications-outline'} boyut={26} />
      {sayi > 0 ? (
        <View
          testID="bildirim-rozeti"
          className="absolute right-0 top-1 items-center rounded-tam bg-hata px-1"
          style={{ minWidth: 18 }}
        >
          <Metin varyant="kucuk" className="text-arkaPlan">
            {metin}
          </Metin>
        </View>
      ) : null}
    </Pressable>
  );
}
