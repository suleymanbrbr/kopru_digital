import { Ionicons } from '@expo/vector-icons';
import { t } from '@kopru/i18n';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ROL_SEKMELERI, TUM_SEKME_ADLARI, modulAcikMi } from '../../../nav/yapilandirma';
import { useTema } from '../../../tema/TemaSaglayici';
import { useAktif } from '../../../uygulama/baglam';

/**
 * Rol -> sekme yapilandirmasi tek yerde (nav/yapilandirma.ts). Rota dosyalari tum sekmeler icin
 * vardir; role ait olmayan ya da modulu kapali sekmeler `href: null` ile gizlenir.
 */
export default function SekmeDuzeni() {
  const aktif = useAktif();
  const { renkler } = useTema();
  const { bottom } = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  if (!aktif) return <Redirect href="/" />;

  const rolSekmeleri = ROL_SEKMELERI[aktif.uyelik.rol];
  const gorunen = new Set(
    rolSekmeleri.filter((s) => modulAcikMi(aktif.moduller, s.modul)).map((s) => s.ad),
  );
  // Sira: role ait sekmeler yapilandirma sirasinda, sonra gizli olanlar.
  const sira = [
    ...rolSekmeleri.map((s) => s.ad),
    ...TUM_SEKME_ADLARI.filter((a) => !rolSekmeleri.some((s) => s.ad === a)),
  ];

  // Sekme cubugu: ikon (24) + etiket (buyuk yazi boyutuyla buyur) + dikey bosluk + alt guvenli alan
  // (Home gostergesi). Yukseklik acikca verilir; aksi halde etiket alttan kesilir.
  const etiketYuksekligi = Math.ceil(14 * Math.min(Math.max(fontScale, 1), 2));
  const cubukYuksekligi = 24 + etiketYuksekligi + 24 + bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: renkler.birincil,
        tabBarInactiveTintColor: renkler.metinIkincil,
        tabBarStyle: {
          backgroundColor: renkler.yuzey,
          borderTopColor: renkler.kenar,
          height: cubukYuksekligi,
          paddingTop: 8,
          paddingBottom: bottom + 8,
        },
        tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 14 },
      }}
    >
      {sira.map((ad) => {
        const tanim = rolSekmeleri.find((s) => s.ad === ad);
        const goster = !!tanim && gorunen.has(ad);
        return (
          <Tabs.Screen
            key={ad}
            name={ad}
            options={
              goster
                ? {
                    title: t(tanim.baslik),
                    tabBarAccessibilityLabel: t(tanim.baslik),
                    tabBarIcon: ({ color }) => (
                      <Ionicons name={tanim.ikon} size={24} color={color as string} />
                    ),
                  }
                : { href: null }
            }
          />
        );
      })}
    </Tabs>
  );
}
