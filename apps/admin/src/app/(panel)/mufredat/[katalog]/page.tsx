import { t } from '@kopru/i18n';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { KatalogEditoru } from '@/components/mufredat/katalog-editoru';
import { KATALOG_KODLARI } from '@/lib/mufredat';

export const metadata: Metadata = { title: t('yonetim.nav.mufredat') };

export default async function Sayfa({ params }: { params: Promise<{ katalog: string }> }) {
  const { katalog } = await params;
  const kod = KATALOG_KODLARI.find((k) => k === katalog);
  if (!kod) notFound();
  return <KatalogEditoru kod={kod} />;
}
