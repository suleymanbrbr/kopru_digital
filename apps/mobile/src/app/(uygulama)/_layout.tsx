import { t } from '@kopru/i18n';
import { Stack } from 'expo-router';

import { ortam } from '../../ortam';
import { useTema } from '../../tema/TemaSaglayici';

export default function UygulamaDuzeni() {
  const { renkler } = useTema();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: renkler.yuzey },
        headerTintColor: renkler.metin,
        headerTitleStyle: { fontFamily: 'Inter_700Bold' },
        headerBackTitle: t('ortak.geri'),
      }}
    >
      <Stack.Screen name="(sekmeler)" options={{ headerShown: false }} />
      <Stack.Screen
        name="odaklan"
        options={{ title: t('mobil.odaklan.baslik'), presentation: 'modal' }}
      />
      <Stack.Screen name="kurum" options={{ title: t('mobil.kurum.baslik') }} />
      <Stack.Screen name="oturumlar" options={{ title: t('mobil.oturumlar.baslik') }} />
      <Stack.Screen name="katilim" options={{ title: t('mobil.sinifKodu.baslik') }} />
      <Stack.Screen name="ders-ekle" options={{ title: t('mobil.ders.formBaslik') }} />
      <Stack.Screen name="yoklama/[dersId]" options={{ title: t('mobil.yoklama.ekranBaslik') }} />
      <Stack.Screen name="senkron" options={{ title: t('mobil.senkron.baslik') }} />
      <Stack.Screen name="ogrenci/[id]" options={{ title: t('mobil.finans.kartBaslik') }} />
      <Stack.Screen name="paket-sat" options={{ title: t('mobil.finans.paketSatBaslik') }} />
      <Stack.Screen name="odeme-al" options={{ title: t('mobil.finans.odemeAlBaslik') }} />
      <Stack.Protected guard={ortam.gelistirici}>
        <Stack.Screen name="bilesenler" options={{ title: t('mobil.bilesenler.baslik') }} />
      </Stack.Protected>
    </Stack>
  );
}
