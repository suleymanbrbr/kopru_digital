import { t } from '@kopru/i18n';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { KurumDetaySayfasi } from '@/components/kurumlar/kurum-detay';
import { uuidMi } from '@/lib/bicim';

export const metadata: Metadata = { title: t('yonetim.nav.kurumlar') };

export default async function Sayfa({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidMi(id)) notFound();
  return <KurumDetaySayfasi id={id} />;
}
