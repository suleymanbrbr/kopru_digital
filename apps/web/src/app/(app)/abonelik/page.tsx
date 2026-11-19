import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AbonelikDonusu } from '@/components/abonelik/abonelik-donusu';

export const metadata: Metadata = { title: 'Abonelik' };

/**
 * Odeme saglayicisi donusu: `api` kullaniciyi `${WEB_URL}/abonelik?odeme=<sonuc>` adresine yollar (kurumsuz).
 * Bu sayfa sonucu koruyarak sahip kurumun abonelik ekranina yonlendirir.
 */
export default function AbonelikDonusSayfasi() {
  return (
    <Suspense>
      <AbonelikDonusu />
    </Suspense>
  );
}
