import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { yuzdeMetni } from '../../gunluk/kurallar';
import { bugunTarihi } from '../../lib/saat';
import { Dugme } from '../../ui/Dugme';
import { KartHatasi, KartYukleniyor } from '../../ui/Durumlar';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { useGunlukKayitlarim } from '../../uygulama/gunluk';
import { hataMesaji } from '../../uygulama/hatalar';
import { useSaatDilimi } from '../../uygulama/operasyon';
import { GunlukGonderimKartlari } from './GunlukGonderimKartlari';

/**
 * Ogrenci "Bugun": "Soru cozdum" hizli girisi, bugunun ozeti, gonderilmemis kayitlar ve kayitlarim /
 * konu analizim baglantilari. Kendi sorgusunu yonetir: hata yalniz bu karti etkiler.
 */
export function GunlukBugunKarti() {
  const router = useRouter();
  const { tz } = useSaatDilimi();
  const bugun = bugunTarihi(tz);
  const sorgu = useGunlukKayitlarim({ gun: bugun });
  const kayitlar = sorgu.data?.pages.flatMap((s) => s.kayitlar) ?? [];
  const toplam = kayitlar.reduce((a, k) => a + k.toplam, 0);
  const dogru = kayitlar.reduce((a, k) => a + k.dogru, 0);
  return (
    <View className="gap-3" testID="gunluk-bugun">
      <Kart className="gap-3">
        <Metin varyant="altBaslik" accessibilityRole="header">
          {t('mobil.gunluk.bugun.baslik')}
        </Metin>
        {sorgu.isPending ? <KartYukleniyor /> : null}
        {sorgu.isError && !sorgu.data ? (
          <KartHatasi mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
        ) : null}
        {sorgu.data ? (
          <Metin testID="gunluk-bugun-ozet" accessibilityLiveRegion="polite">
            {toplam === 0
              ? t('mobil.gunluk.bugun.bos')
              : t('mobil.gunluk.bugun.ozet', {
                  n: toplam,
                  yuzde: yuzdeMetni(toplam > 0 ? dogru / toplam : null),
                })}
          </Metin>
        ) : null}
        <Dugme
          buyuk
          varyant="vurgu"
          etiket={t('mobil.gunluk.bugun.soruCozdum')}
          testID="bugun-soru-cozdum"
          onPress={() => {
            router.push('/gunluk-soru-yeni');
          }}
        />
        <View className="flex-row gap-2">
          <Dugme
            className="flex-1"
            varyant="ikincil"
            etiket={t('mobil.gunluk.bugun.kayitlarim')}
            testID="bugun-gunluk-kayitlarim"
            onPress={() => {
              router.push('/gunluk-kayitlarim');
            }}
          />
          <Dugme
            className="flex-1"
            varyant="ikincil"
            etiket={t('mobil.gunluk.bugun.analizim')}
            testID="bugun-konu-analizim"
            onPress={() => {
              router.push('/konu-analizi');
            }}
          />
        </View>
      </Kart>
      <GunlukGonderimKartlari />
    </View>
  );
}
