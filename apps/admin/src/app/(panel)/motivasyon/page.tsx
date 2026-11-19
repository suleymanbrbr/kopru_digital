import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { MotivasyonSayfasi } from '@/components/motivasyon/motivasyon-sayfasi';

export const metadata: Metadata = { title: t('yonetim.nav.motivasyon') };

export default function Sayfa() {
  return <MotivasyonSayfasi />;
}
