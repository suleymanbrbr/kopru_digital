import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AbonelikEkrani } from '@/components/abonelik/abonelik-ekrani';

export const metadata: Metadata = { title: 'Abonelik' };

export default function AbonelikSayfasi() {
  return (
    <Suspense>
      <AbonelikEkrani />
    </Suspense>
  );
}
