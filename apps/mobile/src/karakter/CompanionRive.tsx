import {
  Fit,
  RiveView,
  useRiveFile,
  useViewModelInstance,
  type ViewModelInstance,
} from '@rive-app/react-native';
import { useEffect, useRef, useState } from 'react';

import {
  EVRIM_ZAMAN_ASIMI_MS,
  RIVE,
  evrimGerekli,
  riveGirdileri,
  ruhHaliTetikleri,
} from './girdiler';
import type { CompanionProps, RiveKaynagi } from './tipler';

interface Props {
  props: CompanionProps;
  kaynak: RiveKaynagi;
  boyut: number;
  /** Yukleme/calisma hatasinda statik gorsele dusmek icin. */
  hata: () => void;
}

function sayiYaz(vm: ViewModelInstance, ad: string, deger: number) {
  vm.numberProperty(ad)?.set(deger);
}

/**
 * Rive ile cizim. Yeni resmi runtime (@rive-app/react-native) state machine girdilerini
 * (setNumberInputValue/triggerInput) ve olaylari desteklemez; bunun yerine veri baglama (View Model)
 * kullanilir. Sozlesmedeki girdi adlari ayni adli View Model ozellikleri olarak beklenir
 * (bkz. girdiler.ts ve rapordaki sozlesme notu). Cihazda dogrulanmadi: .riv teslim edilince test edin.
 */
export function CompanionRive({ props, kaynak, boyut, hata }: Props) {
  const { riveFile, error } = useRiveFile(kaynak);
  const { instance } = useViewModelInstance(riveFile, {
    async: true,
    artboardName: RIVE.artboard,
  });
  const onceki = useRef<{ ruhHali: CompanionProps['ruhHali']; asama: number } | undefined>(undefined);
  const [gorunenAsama, setGorunenAsama] = useState(props.asama);

  useEffect(() => {
    if (error) hata();
  }, [error, hata]);

  // Evrim: tetikleyici ver, asamayi evo_midpoint (ya da zaman asimi) ile uygula.
  useEffect(() => {
    if (!instance) return;
    if (!evrimGerekli(onceki.current?.asama, props.asama)) {
      setGorunenAsama(props.asama);
      return;
    }
    instance.triggerProperty('evolve')?.trigger();
    const iptal = instance.triggerProperty('evo_midpoint')?.addListener(() => {
      setGorunenAsama(props.asama);
    });
    const zamanAsimi = setTimeout(() => {
      setGorunenAsama(props.asama);
    }, EVRIM_ZAMAN_ASIMI_MS);
    return () => {
      clearTimeout(zamanAsimi);
      iptal?.();
    };
  }, [instance, props.asama]);

  useEffect(() => {
    if (!instance) return;
    const g = riveGirdileri({ ...props, asama: gorunenAsama }, false);
    for (const [ad, deger] of Object.entries(g.sayilar)) sayiYaz(instance, ad, deger);
    for (const [ad, deger] of Object.entries(g.mantiksal)) instance.booleanProperty(ad)?.set(deger);
    for (const t of ruhHaliTetikleri(onceki.current?.ruhHali, props.ruhHali)) {
      instance.triggerProperty(t)?.trigger();
    }
    onceki.current = { ruhHali: props.ruhHali, asama: props.asama };
  }, [instance, props, gorunenAsama]);

  if (!riveFile || !instance) return null;
  return (
    <RiveView
      file={riveFile}
      artboardName={RIVE.artboard}
      stateMachineName={RIVE.stateMachine}
      dataBind={instance}
      fit={Fit.Contain}
      style={{ width: boyut, height: boyut }}
      onError={hata}
    />
  );
}
