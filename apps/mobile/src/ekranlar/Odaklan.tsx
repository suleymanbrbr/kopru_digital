import { t } from '@kopru/i18n';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Companion } from '../karakter/Companion';
import { Dugme } from '../ui/Dugme';
import { Ekran } from '../ui/Ekran';
import { Metin } from '../ui/Metin';
import { useOgrenciBugun } from '../uygulama/sorgular';

const SURE_SN = 25 * 60;

export function sureBicimle(sn: number): string {
  const d = Math.floor(sn / 60);
  const s = sn % 60;
  return `${String(d).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Odak sayaci iskeleti: yol arkadasi odak halinde yaninda oturur. Kalicilik/XP sonra gelecek. */
export function Odaklan() {
  const { data } = useOgrenciBugun();
  const [calisiyor, setCalisiyor] = useState(false);
  const [bitti, setBitti] = useState(false);
  const [kalan, setKalan] = useState(SURE_SN);

  useEffect(() => {
    if (!calisiyor) return;
    const z = setInterval(() => {
      setKalan((k) => {
        if (k <= 1) {
          setCalisiyor(false);
          setBitti(true);
          return SURE_SN;
        }
        return k - 1;
      });
    }, 1000);
    return () => {
      clearInterval(z);
    };
  }, [calisiyor]);

  const k = data?.karakter;
  return (
    <Ekran kaydir={false} className="items-center justify-center">
      <Companion
        tur={k?.tur ?? 'kivilcim'}
        asama={k?.asama ?? 1}
        seviye={k?.seviye ?? 1}
        varyant={k?.varyant ?? 0}
        ad={k?.ad}
        ruhHali={bitti ? 'kutlama' : calisiyor ? 'odak' : 'normal'}
        boyut={200}
      />
      <View accessible accessibilityLabel={t('mobil.odaklan.sureEtiketi', { sure: sureBicimle(kalan) })}>
        <Metin varyant="baslik" className="text-center text-3xl">
          {sureBicimle(kalan)}
        </Metin>
      </View>
      <Metin varyant="ikincil" className="text-center">
        {bitti ? t('mobil.odaklan.bitti') : t('mobil.odaklan.ipucu')}
      </Metin>
      <Dugme
        buyuk
        className="self-stretch"
        etiket={calisiyor ? t('mobil.odaklan.duraklat') : t('mobil.odaklan.baslat')}
        varyant={calisiyor ? 'ikincil' : 'birincil'}
        onPress={() => {
          setBitti(false);
          if (calisiyor) setKalan(SURE_SN);
          setCalisiyor((c) => !c);
        }}
      />
    </Ekran>
  );
}
