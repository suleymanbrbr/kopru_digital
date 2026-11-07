import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { tercihler } from '../tema/tercihler';

/**
 * Hareket azaltma: isletim sistemi "hareketi azalt" ayari ACIK ya da uygulama ici "Animasyonlar"
 * tercihi KAPALI ise true (Rive calistirilmaz, statik gorsel gosterilir).
 */
export function useHareketAzalt(): boolean {
  const [sistem, setSistem] = useState(false);
  const animasyonlar = tercihler.kullan((t) => t.animasyonlar);

  useEffect(() => {
    let canli = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (canli) setSistem(v);
    });
    const abone = AccessibilityInfo.addEventListener('reduceMotionChanged', setSistem);
    return () => {
      canli = false;
      abone.remove();
    };
  }, []);

  return sistem || !animasyonlar;
}
