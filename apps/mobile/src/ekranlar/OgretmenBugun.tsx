import { t } from '@kopru/i18n';
import { View } from 'react-native';

import { bugunTarihi } from '../lib/saat';
import { BekleyenSorularKarti } from '../soru/BugunKartlari';
import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ekran } from '../ui/Ekran';
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
} from '../uygulama/operasyon';
import { useOgretmenBugun } from '../uygulama/sorgular';
import { BekleyenYoklamaKartlari } from './BekleyenYoklamaKartlari';
import { CevrimdisiSerit } from './CevrimdisiSerit';
import { DersSatiri } from './DerslerEkrani';
import { OgretmenOgrenmeKartlari } from './OgretmenOgrenmeKartlari';

function Bolum({ baslik, children }: { baslik: string; children: React.ReactNode }) {
  return (
    <Kart className="gap-2">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {baslik}
      </Metin>
      {children}
    </Kart>
  );
}

export function OgretmenBugun() {
  const oturum = useOturum();
  const sorgu = useOgretmenBugun();
  const takvim = useModulAcik('takvim');
  const yoklama = useModulAcik('yoklama');
  const { tz } = useSaatDilimi();
  const bugun = useGunDersleri(bugunTarihi(tz));
  const gruplar = useGruplar();
  const ad = oturum.asama === 'giris' ? oturum.kullanici.adSoyad.split(' ')[0] : '';

  return (
    <Ekran ust={<CevrimdisiSerit />} kenarlar={['top', 'left', 'right']}>
      <View>
        <Metin varyant="baslik" accessibilityRole="header">
          {t('mobil.sekmeler.bugun')}
        </Metin>
        <Metin varyant="ikincil">{t('mobil.bugun.selam', { ad: ad ?? '' })}</Metin>
      </View>
      {yoklama ? <BekleyenYoklamaKartlari /> : null}
      <OgretmenOgrenmeKartlari />
      {takvim ? (
        <Bolum baslik={t('mobil.bugun.ogretmen.bugunkuDersler')}>
          {bugun.isPending ? <Yukleniyor /> : null}
          {bugun.data?.length === 0 ? (
            <BosDurum ikon="calendar-outline" mesaj={t('mobil.bugun.ogretmen.bugunkuDerslerBos')} />
          ) : null}
          {bugun.data?.map((d) => (
            <DersSatiri key={d.id} ders={d} ad={dersAdi(d, gruplar.data)} tz={tz} />
          ))}
        </Bolum>
      ) : null}
      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {sorgu.data ? (
        <>
          <BekleyenSorularKarti />
        </>
      ) : null}
    </Ekran>
  );
}
