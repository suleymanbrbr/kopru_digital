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
      <Stack.Protected guard={ortam.gelistirici}>
        <Stack.Screen name="bilesenler" options={{ title: t('mobil.bilesenler.baslik') }} />
      </Stack.Protected>
    </Stack>
  );
}
