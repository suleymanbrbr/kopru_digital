import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { OdakEkrani } from '@/components/motivasyon/odak-ekrani';

export const metadata: Metadata = { title: t('motivasyon.odak.baslik') };

export default function OdakSayfasi() {
  return <OdakEkrani />;
}
