import { Suspense } from 'react';

import { GunlukSoruEkrani } from '@/components/gunluk-soru/ekranlar';

export default function GunlukSoruSayfasi() {
  // `useSearchParams` (`?sekme=analiz`) icin Suspense siniri gerekir.
  return (
    <Suspense fallback={null}>
      <GunlukSoruEkrani />
    </Suspense>
  );
}
