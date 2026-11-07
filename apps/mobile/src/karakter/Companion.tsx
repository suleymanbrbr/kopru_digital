import { t } from '@kopru/i18n';
import { lazy, Suspense, useCallback, useState } from 'react';
import { Platform, View } from 'react-native';

import { useHareketAzalt } from '../hooks/useHareketAzalt';

import { CompanionStatik } from './CompanionStatik';
import { TUR_ADLARI, asamaSinirla } from './girdiler';
import type { CompanionProps } from './tipler';

// Rive native modulu yalnizca kaynak verildiginde yuklenir (web/jest/statik durumda hic gerekmez).
const CompanionRive = lazy(() =>
  import('./CompanionRive').then((m) => ({ default: m.CompanionRive })),
);

export function companionEtiketi(p: Pick<CompanionProps, 'tur' | 'ad' | 'asama' | 'ruhHali'>): string {
  const ruhHali = t(`mobil.karakter.ruhHali.${p.ruhHali ?? 'normal'}`);
  return t('mobil.karakter.etiket', {
    ad: p.ad ?? t(TUR_ADLARI[p.tur]),
    asama: asamaSinirla(p.asama),
    ruhHali,
  });
}

/**
 * Yol arkadasi. `riveKaynagi` varsa ve hareket serbestse Rive ile; aksi halde (su an) SVG yer tutucu.
 * Hareket azaltma aciksa ya da Rive yuklenemezse statik gorsele duser. Erisilebilirlik etiketini
 * uygulama verir (Rive icinde metin yok).
 */
export function Companion(props: CompanionProps) {
  const { tur, asama, varyant, riveKaynagi, statik } = props;
  const boyut = Math.min(Math.max(props.boyut ?? 160, 48), 320);
  const hareketAzalt = useHareketAzalt();
  const [riveHatali, setRiveHatali] = useState(false);
  const riveHata = useCallback(() => {
    setRiveHatali(true);
  }, []);

  const riveKullan = !!riveKaynagi && !statik && !hareketAzalt && !riveHatali && Platform.OS !== 'web';
  const statikGorsel = (
    <CompanionStatik
      tur={tur}
      asama={asama}
      varyant={varyant}
      boyut={boyut}
      nefes={!hareketAzalt && !statik}
    />
  );

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={companionEtiketi(props)}
      style={{ width: boyut, height: boyut }}
    >
      {riveKullan ? (
        <Suspense fallback={statikGorsel}>
          <CompanionRive props={props} kaynak={riveKaynagi} boyut={boyut} hata={riveHata} />
        </Suspense>
      ) : (
        statikGorsel
      )}
    </View>
  );
}
