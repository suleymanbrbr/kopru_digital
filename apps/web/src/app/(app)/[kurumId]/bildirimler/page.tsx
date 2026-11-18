import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { BildirimlerEkrani } from '@/components/bildirim/bildirimler-ekrani';

export const metadata: Metadata = { title: t('bildirim.sayfa.baslik') };

export default function BildirimlerSayfasi() {
  return <BildirimlerEkrani />;
}
