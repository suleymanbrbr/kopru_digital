import { t } from '@kopru/i18n';
import { View } from 'react-native';

import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ekran } from '../ui/Ekran';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { useOturum } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import { useOgretmenBugun } from '../uygulama/sorgular';

import { CevrimdisiSerit } from './CevrimdisiSerit';

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
  const ad = oturum.asama === 'giris' ? oturum.kullanici.adSoyad.split(' ')[0] : '';

  return (
    <>
      <CevrimdisiSerit />
      <Ekran kenarlar={['top', 'left', 'right']}>
        <View>
          <Metin varyant="baslik" accessibilityRole="header">
            {t('mobil.sekmeler.bugun')}
          </Metin>
          <Metin varyant="ikincil">{t('mobil.bugun.selam', { ad: ad ?? '' })}</Metin>
        </View>
        {sorgu.isPending ? <Yukleniyor /> : null}
        {sorgu.isError ? (
          <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
        ) : null}
        {sorgu.data ? (
          <>
            <Bolum baslik={t('mobil.bugun.ogretmen.bugunkuDersler')}>
              {sorgu.data.dersler.length === 0 ? (
                <BosDurum ikon="calendar-outline" mesaj={t('mobil.bugun.ogretmen.bugunkuDerslerBos')} />
              ) : (
                sorgu.data.dersler.map((d) => (
                  <Metin key={d.id}>
                    {d.saat} {d.baslik}
                  </Metin>
                ))
              )}
            </Bolum>
            <Bolum baslik={t('mobil.bugun.ogretmen.bekleyenSorular')}>
              {sorgu.data.bekleyenSorular.length === 0 ? (
                <BosDurum ikon="chatbubbles-outline" mesaj={t('mobil.bugun.ogretmen.bekleyenSorularBos')} />
              ) : (
                sorgu.data.bekleyenSorular.map((s) => (
                  <Metin key={s.id}>
                    {s.ogrenciAd}: {s.konu}
                  </Metin>
                ))
              )}
            </Bolum>
          </>
        ) : null}
      </Ekran>
    </>
  );
}
