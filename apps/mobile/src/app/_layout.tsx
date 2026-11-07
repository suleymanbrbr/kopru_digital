import '../global.css';

import { Ionicons } from '@expo/vector-icons';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { kvkkOnayliMi } from '../oturum/yonetici';
import { TemaSaglayici, useTema } from '../tema/TemaSaglayici';
import { UygulamaSaglayicilari, useOturum } from '../uygulama/baglam';

void SplashScreen.preventAutoHideAsync();

export { ErrorBoundary } from 'expo-router';

function Yonlendirme() {
  const oturum = useOturum();
  const { sema } = useTema();
  const giris = oturum.asama === 'giris';
  const kvkk = giris && kvkkOnayliMi(oturum.kvkk);
  const aktif = giris && oturum.aktif !== null;

  return (
    <>
      <StatusBar style={sema === 'koyu' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        {/* index: geri donus noktasi; <Redirect> ile durumdan yonlenir */}
        <Stack.Screen name="index" />
        <Stack.Protected guard={oturum.asama === 'cikis'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={giris && !kvkk}>
          <Stack.Screen name="(onboarding)/kvkk" />
        </Stack.Protected>
        <Stack.Protected guard={giris && kvkk && !aktif}>
          <Stack.Screen name="(onboarding)/kurum-sec" />
        </Stack.Protected>
        <Stack.Protected guard={giris && kvkk && aktif}>
          <Stack.Screen name="(uygulama)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

function VurguluTema({ children }: { children: React.ReactNode }) {
  const oturum = useOturum();
  const vurgu = oturum.asama === 'giris' ? (oturum.aktif?.vurgu ?? null) : null;
  return <TemaSaglayici vurgu={vurgu}>{children}</TemaSaglayici>;
}

function Acilis({ children }: { children: React.ReactNode }) {
  const oturum = useOturum();
  const [yazilarHazir, yaziHatasi] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
    ...Ionicons.font,
  });
  const hazir = (yazilarHazir || yaziHatasi !== null) && oturum.asama !== 'baslatiliyor';

  useEffect(() => {
    if (hazir) void SplashScreen.hideAsync();
  }, [hazir]);

  return hazir ? children : null;
}

export default function KokDuzen() {
  return (
    <SafeAreaProvider>
      <UygulamaSaglayicilari>
        <VurguluTema>
          <Acilis>
            <Yonlendirme />
          </Acilis>
        </VurguluTema>
      </UygulamaSaglayicilari>
    </SafeAreaProvider>
  );
}
