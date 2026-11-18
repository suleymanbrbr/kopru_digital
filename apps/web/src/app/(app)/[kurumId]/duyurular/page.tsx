import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { DuyurularEkrani } from '@/components/duyuru/duyurular-ekrani';

export const metadata: Metadata = { title: t('duyurular.baslik') };

export default function DuyurularSayfasi() {
  return <DuyurularEkrani />;
}
