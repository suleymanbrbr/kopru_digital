import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { kisaZaman } from '../lib/saat';
import { bransAdi } from '../ogrenme/konu';
import { Dugme } from '../ui/Dugme';
import { BosDurum } from '../ui/Durumlar';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { useSaatDilimi } from '../uygulama/operasyon';
import {
  useGelenSorular,
  useGelenSoruSayisi,
  useOgrenciSoruAcik,
  usePersonelSoruAcik,
  useSorularim,
} from '../uygulama/soru';
import { SoruSatiri } from './SoruSatiri';

/**
 * Ogretmen Bugun: "Cevap bekleyen sorular (N)" ve en eski bekleyen soru. Modul kapaliysa hic
 * gorunmez. Bos durumda yargilayici olmayan kisa metin.
 */
export function BekleyenSorularKarti() {
  const router = useRouter();
  const { tz } = useSaatDilimi();
  const acik = usePersonelSoruAcik();
  const sayi = useGelenSoruSayisi();
  const liste = useGelenSorular({}, acik);
  if (!acik) return null;
  const n = sayi.data?.bekleyen ?? 0;
  // Kuyruk en eski once siralidir.
  const enEski = liste.data?.pages[0]?.sorular[0];
  return (
    <Kart className="gap-3" testID="bekleyen-sorular">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.soru.ogretmen.bekleyenBaslik', { n })}
      </Metin>
      {n === 0 && sayi.data ? (
        <BosDurum ikon="chatbubbles-outline" mesaj={t('mobil.soru.ogretmen.bekleyenBos')} />
      ) : null}
      {enEski ? (
        <>
          <Metin varyant="ikincil" testID="en-eski">
            {t('mobil.soru.ogretmen.enEski', {
              ogrenci: enEski.ogrenciAdi ?? bransAdi(enEski.bransKodu),
              zaman: kisaZaman(enEski.sonHareket, tz),
            })}
          </Metin>
          <SoruSatiri
            soru={enEski}
            tz={tz}
            ogrencili
            onPress={() => {
              router.push({ pathname: '/(uygulama)/soru/[id]', params: { id: enEski.id } });
            }}
          />
        </>
      ) : null}
      {n > 0 ? (
        <Dugme
          varyant="ikincil"
          etiket={t('mobil.soru.ogretmen.tumSorular')}
          onPress={() => {
            router.navigate('/sorular');
          }}
          testID="tum-sorular"
        />
      ) : null}
    </Kart>
  );
}

/** Ogrenci Bugun: cevaplanan sorularim (soru sor dugmesi ekranin altinda ayridir). */
export function CevaplananSorularKarti() {
  const router = useRouter();
  const { tz } = useSaatDilimi();
  const acik = useOgrenciSoruAcik();
  const sorgu = useSorularim({ durum: 'cevaplandi' }, acik);
  if (!acik) return null;
  const sorular = (sorgu.data?.pages[0]?.sorular ?? []).slice(0, 3);
  return (
    <Kart className="gap-3" testID="cevaplanan-sorular">
      <View className="flex-row items-center gap-2">
        <Ikon ad="chatbubble-ellipses" boyut={20} />
        <Metin varyant="altBaslik" accessibilityRole="header" className="flex-1">
          {t('mobil.soru.ogrenci.cevaplanan')}
        </Metin>
      </View>
      {sorgu.data && sorular.length === 0 ? (
        <Metin varyant="ikincil">{t('mobil.soru.ogrenci.cevaplananBos')}</Metin>
      ) : null}
      {sorular.map((s) => (
        <SoruSatiri
          key={s.id}
          soru={s}
          tz={tz}
          onPress={() => {
            router.push({ pathname: '/(uygulama)/soru/[id]', params: { id: s.id } });
          }}
        />
      ))}
    </Kart>
  );
}
