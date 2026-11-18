import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';

import type { BildirimRotasi } from '../../bildirim/baglanti';
import { useServisler } from '../../uygulama/baglam';

/**
 * Bildirime dokunma hedefini expo-router'a baglar (gorunmez). Kok duzende, oturum korumali grup
 * ciziliyken calisir; yonetici hedefi giris + KVKK + kurum secimi hazir olunca verir.
 */
export function BildirimYonlendirici() {
  const router = useRouter();
  const { bildirim } = useServisler();

  useEffect(
    () =>
      bildirim.yonlendirmeBagla((rota: BildirimRotasi) => {
        const hedef = (
          rota.params ? { pathname: rota.pathname, params: rota.params } : rota.pathname
        ) as Href;
        // Soguk acilista ilk ekran `index` yonlendirmesidir; kisa bir gecikme onun bitmesini bekler.
        setTimeout(() => {
          if (rota.navigate) router.navigate(hedef);
          else router.push(hedef);
        }, 250);
      }),
    [bildirim, router],
  );

  return null;
}
