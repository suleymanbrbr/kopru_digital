import { t } from '@kopru/i18n';
import { View } from 'react-native';

import { Companion } from '../karakter/Companion';
import { TUR_ADLARI } from '../karakter/girdiler';
import type { Beceriler } from '../karakter/tipler';
import { Ekran } from '../ui/Ekran';
import { HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { hataMesaji } from '../uygulama/hatalar';
import { useOgrenciBugun } from '../uygulama/sorgular';

import { CevrimdisiSerit } from './CevrimdisiSerit';

const BECERILER: (keyof Beceriler)[] = ['sayisal', 'sozel', 'fen', 'sosyal', 'dil'];

export function Karakterim() {
  const sorgu = useOgrenciBugun();
  const k = sorgu.data?.karakter;
  return (
    <>
      <CevrimdisiSerit />
      <Ekran kenarlar={['top', 'left', 'right']}>
        <Metin varyant="baslik" accessibilityRole="header">
          {t('mobil.karakterim.baslik')}
        </Metin>
        {sorgu.isPending ? <Yukleniyor /> : null}
        {sorgu.isError ? <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} /> : null}
        {k ? (
          <>
            <Kart className="items-center gap-2">
              <Companion
                tur={k.tur}
                asama={k.asama}
                seviye={k.seviye}
                varyant={k.varyant}
                beceriler={k.beceriler}
                ruhHali={k.uykulu ? 'uykulu' : 'normal'}
                ad={k.ad}
                boyut={240}
              />
              <Metin varyant="altBaslik">{k.ad}</Metin>
              <Metin varyant="ikincil">
                {t(TUR_ADLARI[k.tur])} · {t('mobil.karakterim.asama', { asama: k.asama })} ·{' '}
                {t('mobil.karakterim.seviye', { seviye: k.seviye })}
              </Metin>
            </Kart>
            <Kart className="gap-3">
              <Metin varyant="altBaslik" accessibilityRole="header">
                {t('mobil.karakterim.beceriler')}
              </Metin>
              {BECERILER.map((b) => (
                <View
                  key={b}
                  className="gap-1"
                  accessible
                  accessibilityLabel={`${t(`mobil.karakter.beceri.${b}`)}: ${k.beceriler[b]} / 10`}
                >
                  <Metin varyant="ikincil">{t(`mobil.karakter.beceri.${b}`)}</Metin>
                  <View className="h-2 overflow-hidden rounded-tam bg-yuzeyIkincil">
                    <View className="h-2 rounded-tam bg-vurgu" style={{ width: `${k.beceriler[b] * 10}%` }} />
                  </View>
                </View>
              ))}
            </Kart>
          </>
        ) : null}
      </Ekran>
    </>
  );
}
