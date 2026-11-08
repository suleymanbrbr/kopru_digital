import type { Metadata } from 'next';

import { SinifKoduKatil } from '@/components/hesap/sinif-kodu-katil';

export const metadata: Metadata = { title: 'Sınıf koduyla katıl' };

export default function SinifKoduSayfasi() {
  return <SinifKoduKatil />;
}
