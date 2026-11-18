'use client';

import { useEffect } from 'react';

/**
 * Sayfa `?<anahtar>=1` ile acildiysa (ornegin Bugun'deki hizli eylemler) bir kez `ac()` cagirir ve parametreyi
 * adres cubugundan temizler; geri/yenile ayni formu yeniden acmaz. `useSearchParams` yerine adres okunur
 * (Suspense siniri gerekmez).
 */
export function useYeniParametresi(anahtar: string, ac: () => void): void {
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get(anahtar) !== '1') return;
    p.delete(anahtar);
    const kalan = p.toString();
    window.history.replaceState(
      window.history.state as unknown,
      '',
      `${window.location.pathname}${kalan ? `?${kalan}` : ''}${window.location.hash}`,
    );
    ac();
    // Yalniz ilk yuklemede calisir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
