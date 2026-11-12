import { Suspense } from 'react';

import { SorularEkrani } from '@/components/soru/ekranlar';

export default function SorularSayfasi() {
  // `useSearchParams` (`?sekme=`) icin Suspense siniri gerekir.
  return (
    <Suspense fallback={null}>
      <SorularEkrani />
    </Suspense>
  );
}
