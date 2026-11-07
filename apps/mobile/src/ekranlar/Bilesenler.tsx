import { t } from '@kopru/i18n';
import { useState } from 'react';
import { View } from 'react-native';

import { Companion } from '../karakter/Companion';
import { TURLER, ASAMALAR, type RuhHali } from '../karakter/tipler';
import { Dugme } from '../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ekran } from '../ui/Ekran';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';

const HALLER: RuhHali[] = ['normal', 'odak', 'uykulu', 'mutlu', 'kutlama'];

/** Yalnizca gelistirmede: karakter yer tutuculari (3 tur x 5 evre) ve temel bilesenler. */
export function Bilesenler() {
  const [hal, setHal] = useState<RuhHali>('normal');
  return (
    <Ekran kenarlar={['left', 'right', 'bottom']}>
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.bilesenler.karakterler')}
      </Metin>
      <Kart className="gap-3">
        <Metin varyant="ikincil">{t('mobil.bilesenler.ruhHalleri')}</Metin>
        <View className="flex-row flex-wrap gap-2">
          {HALLER.map((h) => (
            <Dugme
              key={h}
              etiket={t(`mobil.karakter.ruhHali.${h}`)}
              varyant={hal === h ? 'birincil' : 'ikincil'}
              onPress={() => {
                setHal(h);
              }}
            />
          ))}
        </View>
      </Kart>
      {TURLER.map((tur) => (
        <Kart key={tur} className="gap-2">
          <Metin varyant="etiket">{t(`mobil.karakter.${tur}`)}</Metin>
          <View className="flex-row flex-wrap justify-between gap-y-3">
            {ASAMALAR.map((a) => (
              <View key={a} className="items-center">
                <Companion tur={tur} asama={a} seviye={a * 8} ruhHali={hal} boyut={96} />
                <Metin varyant="kucuk">{a}</Metin>
              </View>
            ))}
          </View>
        </Kart>
      ))}
      <Kart className="gap-2">
        <Yukleniyor />
        <BosDurum mesaj={t('mobil.sorular.bos')} />
        <HataDurumu mesaj={t('ortak.hataGenel')} tekrar={() => undefined} />
      </Kart>
    </Ekran>
  );
}
