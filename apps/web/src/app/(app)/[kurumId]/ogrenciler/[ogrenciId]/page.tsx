import { Suspense } from 'react';

import { OgrenciProfili } from '@/components/motivasyon/ogrenci-ozeti';

export default function OgrenciProfilSayfasi() {
  // `useSearchParams` (`?sekme=konu-analizi`) icin Suspense siniri gerekir.
  return (
    <Suspense fallback={null}>
      <OgrenciProfili />
    </Suspense>
  );
}
