import { t } from '@kopru/i18n';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { XpKatmani } from '../../ekranlar/motivasyon/XpKatmani';
import { ortam } from '../../ortam';
import { useTema } from '../../tema/TemaSaglayici';
import { useAktif, useServisler } from '../../uygulama/baglam';

/** Giriste devam eden odak oturumunu (cihazdan ya da sunucudan) geri yukler. */
function OdakYukleyici() {
  const { odak } = useServisler();
  const aktif = useAktif();
  const ogrenci = aktif?.uyelik.rol === 'ogrenci';
  const uyelikId = aktif?.uyelik.uyelikId;
  useEffect(() => {
    if (ogrenci) void odak.yukle();
  }, [odak, ogrenci, uyelikId]);
  return null;
}

export default function UygulamaDuzeni() {
  const { renkler } = useTema();
  return (
    <View className="flex-1">
      <OdakYukleyici />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: renkler.yuzey },
          headerTintColor: renkler.metin,
          headerTitleStyle: { fontFamily: 'Inter_700Bold' },
          headerBackTitle: t('ortak.geri'),
        }}
      >
        <Stack.Screen name="(sekmeler)" options={{ headerShown: false }} />
        {/* Modal degil: XP katmani (+N XP, seviye karti) yigin uzerinde cizilir; modal onu orterdi. */}
        <Stack.Screen name="odaklan" options={{ title: t('mobil.odaklan.baslik') }} />
        <Stack.Screen
          name="karakter-sec"
          options={{ title: t('mobil.motivasyon.secim.ekranBaslik'), presentation: 'modal' }}
        />
        <Stack.Screen
          name="grup-motivasyon"
          options={{ title: t('mobil.motivasyon.grup.baslik') }}
        />
        <Stack.Screen name="bildirimler" options={{ title: t('mobil.bildirim.baslik') }} />
        <Stack.Screen
          name="bildirim-tercihleri"
          options={{ title: t('mobil.bildirim.tercih.baslik') }}
        />
        <Stack.Screen name="duyurular" options={{ title: t('mobil.duyuru.baslik') }} />
        <Stack.Screen name="duyuru/[id]" options={{ title: t('mobil.duyuru.detayBaslik') }} />
        <Stack.Screen name="duyuru-yaz" options={{ title: t('mobil.duyuru.yaz.baslik') }} />
        <Stack.Screen name="kurum" options={{ title: t('mobil.kurum.baslik') }} />
        <Stack.Screen name="oturumlar" options={{ title: t('mobil.oturumlar.baslik') }} />
        <Stack.Screen name="katilim" options={{ title: t('mobil.sinifKodu.baslik') }} />
        <Stack.Screen name="ders-ekle" options={{ title: t('mobil.ders.formBaslik') }} />
        <Stack.Screen name="yoklama/[dersId]" options={{ title: t('mobil.yoklama.ekranBaslik') }} />
        <Stack.Screen name="kayitlarim" options={{ title: t('mobil.kayit.baslik') }} />
        <Stack.Screen name="kayit-ekle" options={{ title: t('mobil.kayit.ekle.baslik') }} />
        <Stack.Screen name="senkron" options={{ title: t('mobil.senkron.baslik') }} />
        <Stack.Screen name="ogrenci/[id]" options={{ title: t('mobil.finans.kartBaslik') }} />
        <Stack.Screen name="paket-sat" options={{ title: t('mobil.finans.paketSatBaslik') }} />
        <Stack.Screen name="odeme-al" options={{ title: t('mobil.finans.odemeAlBaslik') }} />
        <Stack.Screen name="odev-ver" options={{ title: t('mobil.ogrenme.odev.odevVer') }} />
        <Stack.Screen name="odev/[id]" options={{ title: t('mobil.ogrenme.odev.ozetBaslik') }} />
        <Stack.Screen
          name="odev-teslim/[id]"
          options={{ title: t('mobil.ogrenme.odev.teslimBaslik') }}
        />
        <Stack.Screen
          name="denemelerim"
          options={{ title: t('mobil.ogrenme.deneme.denemelerim') }}
        />
        <Stack.Screen
          name="deneme-gir"
          options={{ title: t('mobil.ogrenme.deneme.girisBaslik') }}
        />
        <Stack.Screen
          name="deneme-onay"
          options={{ title: t('mobil.ogrenme.deneme.onayKuyrugu') }}
        />
        <Stack.Screen name="soru-yeni" options={{ title: t('mobil.soru.ogrenci.yeniBaslik') }} />
        <Stack.Screen name="sorularim" options={{ title: t('mobil.soru.ogrenci.sorularim') }} />
        <Stack.Screen name="soru/[id]" options={{ title: t('mobil.soru.detay.baslik') }} />
        <Stack.Screen name="soru-cevap/[id]" options={{ title: t('mobil.soru.cevap.baslik') }} />
        <Stack.Protected guard={ortam.gelistirici}>
          <Stack.Screen name="bilesenler" options={{ title: t('mobil.bilesenler.baslik') }} />
        </Stack.Protected>
      </Stack>
      <XpKatmani />
    </View>
  );
}
