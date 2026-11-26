import { Suspense } from 'react';

import { SoruCozdumEkrani } from '@/components/gunluk-soru/ekranlar';

export default function SoruCozdumSayfasi() {
  // `useSearchParams` (`?gorev=...`) icin Suspense siniri gerekir.
  return (
    <Suspense fallback={null}>
      <SoruCozdumEkrani />
    </Suspense>
  );
}
