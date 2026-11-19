import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { TaklitSayfasi } from '@/components/taklit/taklit-sayfasi';

export const metadata: Metadata = { title: t('yonetim.nav.taklit') };

export default function Sayfa() {
  return <TaklitSayfasi />;
}
