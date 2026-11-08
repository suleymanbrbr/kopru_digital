import type { Metadata } from 'next';

import { DavetKabul } from '@/components/hesap/davet-kabul';

// Belirteç adreste taşınır: sayfa dizine alınmaz, yönlendiren adres başka sitelere sızdırılmaz.
export const metadata: Metadata = {
  title: 'Davet',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function DavetSayfasi({ params }: { params: Promise<{ belirtec: string }> }) {
  const { belirtec } = await params;
  return <DavetKabul belirtec={belirtec} />;
}
