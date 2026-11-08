import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { EpostaDogrula } from '@/components/hesap/eposta-dogrula';

export const metadata: Metadata = {
  title: t('hesap.epostaDogrula.baslik'),
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function EpostaDogrulaSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ belirtec?: string | string[] }>;
}) {
  const { belirtec } = await searchParams;
  return <EpostaDogrula belirtec={typeof belirtec === 'string' ? belirtec : null} />;
}
