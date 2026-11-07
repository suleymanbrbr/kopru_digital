import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { BugunEkrani } from '@/components/bugun/bugun-ekrani';

export const metadata: Metadata = { title: t('nav.bugun') };

export default function BugunSayfasi() {
  return <BugunEkrani />;
}
