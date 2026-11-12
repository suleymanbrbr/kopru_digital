import { t } from '@kopru/i18n';
import { Linking, Modal, ScrollView, View, useWindowDimensions, Pressable, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { OkumaAdresi, SoruDurumu } from '../api/soruTipleri';
import { useTema } from '../tema/TemaSaglayici';
import { Dugme } from '../ui/Dugme';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { durumAdi, durumIkonu } from './bicim';
import { gorselKaynagi } from './gorsel';

/** Durum rozeti: renk tek sinyal degildir (ikon + metin birlikte). */
export function DurumRozeti({ durum }: { durum: SoruDurumu }) {
  const { renkler } = useTema();
  const bekliyor = durum === 'acik' || durum === 'takip_bekliyor';
  return (
    <View
      accessible
      accessibilityLabel={durumAdi(durum)}
      testID={`durum-${durum}`}
      className={`flex-row items-center gap-1 self-start rounded-tam border px-3 py-1 ${
        bekliyor ? 'border-uyari' : durum === 'cozuldu' ? 'border-birincil' : 'border-kenar'
      }`}
    >
      <Ikon
        ad={durumIkonu(durum)}
        boyut={14}
        renk={bekliyor ? renkler.uyari : durum === 'cozuldu' ? renkler.birincil : renkler.metinIkincil}
      />
      <Metin varyant="kucuk" className="text-metin">
        {durumAdi(durum)}
      </Metin>
    </View>
  );
}

/** Izin reddedilince: neden gerekli ve Ayarlar'a yonlendirme. */
export function IzinKarti({
  tur,
  kapat,
}: {
  tur: 'kamera' | 'mikrofon' | 'galeri';
  kapat?: () => void;
}) {
  const baslik =
    tur === 'kamera'
      ? t('mobil.soru.izin.kameraBaslik')
      : tur === 'mikrofon'
        ? t('mobil.soru.izin.mikrofonBaslik')
        : t('mobil.soru.izin.galeriBaslik');
  const aciklama =
    tur === 'kamera'
      ? t('mobil.soru.izin.kameraAciklama')
      : tur === 'mikrofon'
        ? t('mobil.soru.izin.mikrofonAciklama')
        : t('mobil.soru.izin.galeriAciklama');
  return (
    <Kart className="gap-3 border-uyari" testID={`izin-${tur}`} accessibilityRole="alert">
      <View className="flex-row items-center gap-2">
        <Ikon ad="lock-closed" boyut={18} />
        <Metin varyant="altBaslik" className="flex-1">
          {baslik}
        </Metin>
      </View>
      <Metin>{aciklama}</Metin>
      <View className="flex-row gap-2">
        <Dugme
          className="flex-1"
          etiket={t('mobil.soru.izin.ayarlar')}
          onPress={() => {
            void Linking.openSettings();
          }}
        />
        {kapat ? (
          <Dugme
            className="flex-1"
            varyant="ikincil"
            etiket={t('mobil.soru.izin.simdiDegil')}
            onPress={kapat}
          />
        ) : null}
      </View>
    </Kart>
  );
}

/** Tam ekran gorsel: iOS'ta iki parmakla yakinlastirma (ScrollView), Android'de sigdirilmis gorunum. */
export function GorselGoruntule({
  adres,
  gorunur,
  kapat,
}: {
  adres: OkumaAdresi | null;
  gorunur: boolean;
  kapat: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const ins = useSafeAreaInsets();
  if (!adres) return null;
  return (
    <Modal visible={gorunur} animationType="fade" onRequestClose={kapat} statusBarTranslucent>
      <View className="flex-1 bg-black" testID="gorsel-tam-ekran">
        <ScrollView
          maximumZoomScale={5}
          minimumZoomScale={1}
          centerContent
          bouncesZoom
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ width, height, justifyContent: 'center' }}
        >
          <Image
            source={gorselKaynagi(adres.asilUrl)}
            style={{ width, height: height - ins.top - ins.bottom }}
            resizeMode="contain"
            accessibilityLabel={t('mobil.soru.ek.fotograf')}
          />
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('mobil.soru.ek.kapat')}
          onPress={kapat}
          style={{ position: 'absolute', top: ins.top + 8, right: 16, minWidth: 44, minHeight: 44 }}
          className="items-center justify-center rounded-tam bg-black/60"
          testID="gorsel-kapat"
        >
          <Ikon ad="close" renk="#FFFFFF" boyut={26} />
        </Pressable>
        <View
          style={{ position: 'absolute', bottom: ins.bottom + 12, left: 0, right: 0 }}
          className="items-center"
        >
          <Metin varyant="kucuk" className="text-white">
            {t('mobil.soru.ek.yakinlastir')}
          </Metin>
        </View>
      </View>
    </Modal>
  );
}
