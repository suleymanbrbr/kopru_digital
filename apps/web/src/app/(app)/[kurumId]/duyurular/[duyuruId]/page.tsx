import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { DuyuruDetayEkrani } from '@/components/duyuru/duyuru-detay';

export const metadata: Metadata = { title: t('duyurular.baslik') };

export default async function DuyuruDetaySayfasi({
  params,
}: {
  params: Promise<{ duyuruId: string }>;
}) {
  const { duyuruId } = await params;
  return <DuyuruDetayEkrani duyuruId={duyuruId} />;
}
