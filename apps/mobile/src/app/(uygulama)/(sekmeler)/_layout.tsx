import { t } from '@kopru/i18n';
import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

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
  if (!aktif) return <Redirect href="/" />;

  const rolSekmeleri = ROL_SEKMELERI[aktif.uyelik.rol];
  const gorunen = new Set(
    rolSekmeleri.filter((s) => modulAcikMi(aktif.moduller, s.modul)).map((s) => s.ad),
  );
  // Sira: role ait sekmeler yapilandirma sirasinda, sonra gizli olanlar.
  const sira = [...rolSekmeleri.map((s) => s.ad), ...TUM_SEKME_ADLARI.filter((a) => !rolSekmeleri.some((s) => s.ad === a))];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: renkler.birincil,
        tabBarInactiveTintColor: renkler.metinIkincil,
        tabBarStyle: { backgroundColor: renkler.yuzey, borderTopColor: renkler.kenar },
        tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11 },
        tabBarItemStyle: { minHeight: 44 },
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
                    tabBarIcon: ({ color, size }) => (
                      <Ionicons name={tanim.ikon} size={size} color={color as string} />
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
