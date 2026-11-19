import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { HesabimEkrani } from '@/components/hesap/hesabim-ekrani';

export const metadata: Metadata = { title: t('hesap.kvkk.baslik') };

export default function HesabimSayfasi() {
  return <HesabimEkrani />;
}
