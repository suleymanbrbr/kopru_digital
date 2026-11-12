import { Suspense } from 'react';

import { KayitlarimEkrani } from '@/components/kayit/kayitlarim-ekrani';

export default function KayitlarimSayfasi() {
  // `useSearchParams` (bildirim baglantisi `?kayit=`) icin Suspense siniri gerekir.
  return (
    <Suspense fallback={null}>
      <KayitlarimEkrani />
    </Suspense>
  );
}
