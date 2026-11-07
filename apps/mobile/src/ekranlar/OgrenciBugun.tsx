import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Companion } from '../karakter/Companion';
import { modulAcikMi } from '../nav/yapilandirma';
import { Dugme } from '../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ekran } from '../ui/Ekran';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { useAktif, useOturum } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import { useOgrenciBugun } from '../uygulama/sorgular';
import { CevrimdisiSerit } from './CevrimdisiSerit';

export function OgrenciBugun() {
  const router = useRouter();
  const oturum = useOturum();
  const aktif = useAktif();
  const sorgu = useOgrenciBugun();
  const ad = oturum.asama === 'giris' ? oturum.kullanici.adSoyad.split(' ')[0] : '';
  const oyun = !!aktif && modulAcikMi(aktif.moduller, 'oyunlastirma');
  const soru = !!aktif && modulAcikMi(aktif.moduller, 'soru_sor');
  const d = sorgu.data;

  return (
    <>
      <CevrimdisiSerit />
      <Ekran kenarlar={['top', 'left', 'right']}>
        <Metin varyant="baslik" accessibilityRole="header">
          {t('mobil.bugun.selam', { ad: ad ?? '' })}
        </Metin>
        {sorgu.isPending ? <Yukleniyor /> : null}
        {sorgu.isError ? (
          <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
        ) : null}
        {d ? (
          <>
            {oyun ? (
              <Kart className="items-center gap-3">
                <Companion
                  tur={d.karakter.tur}
                  asama={d.karakter.asama}
                  seviye={d.karakter.seviye}
                  varyant={d.karakter.varyant}
                  beceriler={d.karakter.beceriler}
                  ruhHali={d.karakter.uykulu ? 'uykulu' : 'normal'}
                  ad={d.karakter.ad}
                  boyut={168}
                />
                <View
                  className="flex-row items-center gap-2 rounded-tam bg-yuzeyIkincil px-4 py-2"
                  accessible
                  accessibilityLabel={`${t('mobil.bugun.ogrenci.seri')}: ${
                    d.seri > 0
                      ? t('mobil.bugun.ogrenci.seriGun', { n: d.seri })
                      : t('mobil.bugun.ogrenci.seriYok')
                  }`}
                >
                  <Ikon ad="flame" renk="#FF8A3D" />
                  <Metin varyant="etiket">
                    {d.seri > 0
                      ? t('mobil.bugun.ogrenci.seriGun', { n: d.seri })
                      : t('mobil.bugun.ogrenci.seriYok')}
                  </Metin>
                </View>
              </Kart>
            ) : null}
            <Kart className="gap-2">
              <Metin varyant="altBaslik" accessibilityRole="header">
                {t('mobil.bugun.ogrenci.bugunkuGorevler')}
              </Metin>
              {d.gorevler.length === 0 ? (
                <BosDurum
                  ikon="checkmark-circle-outline"
                  mesaj={t('mobil.bugun.ogrenci.bugunkuGorevlerBos')}
                />
              ) : (
                d.gorevler.map((g) => <Metin key={g.id}>{g.baslik}</Metin>)
              )}
            </Kart>
          </>
        ) : null}
        <Dugme
          etiket={t('mobil.bugun.ogrenci.odaklan')}
          varyant="birincil"
          buyuk
          onPress={() => {
            router.push('/odaklan');
          }}
        />
        {soru ? (
          <Dugme
            etiket={t('mobil.bugun.ogrenci.soruSor')}
            varyant="vurgu"
            buyuk
            onPress={() => {
              router.navigate('/soru-sor');
            }}
          />
        ) : null}
      </Ekran>
    </>
  );
}
