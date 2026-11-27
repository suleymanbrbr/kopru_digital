import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { BekleyenYoklamaDersi, Ders } from '../api/operasyonTipleri';
import { useBugunOlcumu } from '../lib/olcum';
import { bugunTarihi } from '../lib/saat';
import { BekleyenSorularKarti } from '../soru/BugunKartlari';
import { Dugme } from '../ui/Dugme';
import { BosDurum, KartHatasi, KartYukleniyor } from '../ui/Durumlar';
import { Ekran } from '../ui/Ekran';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { useOturum } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import {
  dersAdi,
  useGruplar,
  useGunDersleri,
  useModulAcik,
  useSaatDilimi,
  useYoklamaBekleyen,
} from '../uygulama/operasyon';
import { BekleyenYoklamaKartlari, YoklamaEylemleri } from './BekleyenYoklamaKartlari';
import { BildirimIzinKarti } from './bildirim/BildirimIzinKarti';
import { BildirimZili } from './bildirim/BildirimZili';
import { CevrimdisiSerit } from './CevrimdisiSerit';
import { DegerlendirmeHatirlatmaKarti } from './degerlendirme/DegerlendirmeHatirlatmaKarti';
import { DersSatiri } from './DerslerEkrani';
import { DuyuruKarti } from './duyuru/DuyuruKarti';
import { SilmeSeridi } from './hesabim/SilmeSeridi';
import { OgretmenOgrenmeKartlari } from './OgretmenOgrenmeKartlari';

/**
 * Bugunku dersin satiri: yoklamasi alinmamis (baslamis, yoklama bekleyen) ders isaretlenir ve satirin
 * altinda tek dokunusluk yoklama eylemi gorunur (birebirde "Geldi"). "Alindi" onayi satirda kalir.
 */
function BugunDersi({
  ders,
  ad,
  tz,
  bekleyen,
}: {
  ders: Ders;
  ad: string;
  tz: string;
  bekleyen: BekleyenYoklamaDersi | undefined;
}) {
  const [alindi, setAlindi] = useState(false);
  return (
    <DersSatiri
      ders={ders}
      ad={ad}
      tz={tz}
      alt={
        alindi ? (
          <View
            className="flex-row items-center gap-2"
            accessibilityLiveRegion="polite"
            testID={`yoklama-alindi-${ders.id}`}
          >
            <Ikon ad="checkmark-circle-outline" boyut={18} />
            <Metin varyant="etiket">{t('mobil.bugun.ogretmen.yoklamaAlindi')}</Metin>
          </View>
        ) : bekleyen ? (
          <View className="gap-2" testID={`yoklama-eksik-${ders.id}`}>
            <View className="flex-row items-center gap-2 self-start rounded-tam bg-yuzeyIkincil px-3 py-1">
              <Ikon ad="alert-circle-outline" boyut={16} />
              <Metin varyant="kucuk">{t('mobil.bugun.ogretmen.yoklamaAlinmadi')}</Metin>
            </View>
            <YoklamaEylemleri
              ders={bekleyen}
              ad={ad}
              alindi={() => {
                setAlindi(true);
              }}
            />
          </View>
        ) : null
      }
    />
  );
}

function HizliEylemler() {
  const router = useRouter();
  const takvim = useModulAcik('takvim');
  const odev = useModulAcik('odev');
  return (
    <Kart className="gap-2" testID="hizli-eylemler">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.bugun.ogretmen.hizliEylemler')}
      </Metin>
      <View className="flex-row flex-wrap gap-2">
        {takvim ? (
          <Dugme
            varyant="ikincil"
            etiket={t('mobil.bugun.ogretmen.dersEkle')}
            testID="hizli-ders-ekle"
            onPress={() => {
              router.push('/ders-ekle');
            }}
          />
        ) : null}
        {odev ? (
          <Dugme
            varyant="ikincil"
            etiket={t('mobil.bugun.ogretmen.odevVer')}
            testID="hizli-odev-ver"
            onPress={() => {
              router.push('/odev-ver');
            }}
          />
        ) : null}
        <Dugme
          varyant="ikincil"
          etiket={t('mobil.bugun.ogretmen.ogrenciEkle')}
          testID="hizli-ogrenci-ekle"
          onPress={() => {
            router.navigate('/ogrenciler');
          }}
        />
      </View>
    </Kart>
  );
}

/**
 * Ogretmen/yonetici "Bugun": bugunku dersler (saat sirasiyla, yoklamasi alinmamis olanlar isaretli ve
 * tek dokunusla yoklama), cevap bekleyen sorular, hizli eylemler. Her kart kendi sorgusunu yonetir:
 * bir servis yanit vermezse yalniz o kart hata gosterir.
 */
export function OgretmenBugun() {
  const oturum = useOturum();
  const takvim = useModulAcik('takvim');
  const yoklama = useModulAcik('yoklama');
  const { tz } = useSaatDilimi();
  const bugun = useGunDersleri(bugunTarihi(tz));
  const gruplar = useGruplar();
  useBugunOlcumu('ogretmen-bugun', bugun.data !== undefined, bugun.dataUpdatedAt);
  const bekleyen = useYoklamaBekleyen();
  const ad = oturum.asama === 'giris' ? oturum.kullanici.adSoyad.split(' ')[0] : '';
  const bekleyenler = new Map((yoklama ? (bekleyen.data ?? []) : []).map((b) => [b.id, b]));
  const dersler = [...(bugun.data ?? [])].sort((a, b) => a.baslangic.localeCompare(b.baslangic));

  return (
    <Ekran
      ust={
        <>
          <CevrimdisiSerit />
          <SilmeSeridi />
        </>
      }
      kenarlar={['top', 'left', 'right']}
    >
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <Metin varyant="baslik" accessibilityRole="header">
            {t('mobil.sekmeler.bugun')}
          </Metin>
          <Metin varyant="ikincil">{t('mobil.bugun.selam', { ad: ad ?? '' })}</Metin>
        </View>
        <BildirimZili />
      </View>
      {takvim ? (
        <Kart className="gap-3" testID="bugunku-dersler">
          <Metin varyant="altBaslik" accessibilityRole="header">
            {t('mobil.bugun.ogretmen.bugunkuDersler')}
          </Metin>
          {bugun.isPending ? <KartYukleniyor /> : null}
          {bugun.isError && !bugun.data ? (
            <KartHatasi
              mesaj={hataMesaji(bugun.error)}
              tekrar={() => {
                void bugun.refetch();
              }}
            />
          ) : null}
          {bugun.data?.length === 0 ? (
            <BosDurum ikon="calendar-outline" mesaj={t('mobil.bugun.ogretmen.bugunkuDerslerBos')} />
          ) : null}
          {dersler.map((d) => (
            <BugunDersi
              key={d.id}
              ders={d}
              ad={dersAdi(d, gruplar.data)}
              tz={tz}
              bekleyen={bekleyenler.get(d.id)}
            />
          ))}
        </Kart>
      ) : null}
      <BekleyenSorularKarti />
      <HizliEylemler />
      {yoklama ? <BekleyenYoklamaKartlari /> : null}
      <DegerlendirmeHatirlatmaKarti />
      <OgretmenOgrenmeKartlari />
      <DuyuruKarti />
      <BildirimIzinKarti />
    </Ekran>
  );
}
