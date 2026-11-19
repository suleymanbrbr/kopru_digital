'use client';

import { useEffect, useState } from 'react';

/** `bitisAt`e kalan saniye (saniyede bir guncellenir, negatife dusmez). */
export function useKalanSure(bitisAt: string): number {
  const [simdi, setSimdi] = useState(() => Date.now());
  useEffect(() => {
    const zamanlayici = setInterval(() => {
      setSimdi(Date.now());
    }, 1000);
    return () => {
      clearInterval(zamanlayici);
    };
  }, []);
  return Math.max(0, Math.ceil((Date.parse(bitisAt) - simdi) / 1000));
}
