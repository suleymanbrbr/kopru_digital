import { Suspense } from 'react';

import { SoruSorEkrani } from '@/components/soru/ekranlar';

export default function SoruSorSayfasi() {
  // `useSearchParams` (`?sekme=sorularim`) icin Suspense siniri gerekir.
  return (
    <Suspense fallback={null}>
      <SoruSorEkrani />
    </Suspense>
  );
}
