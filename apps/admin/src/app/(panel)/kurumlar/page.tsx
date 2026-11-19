import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { KurumListesiSayfasi } from '@/components/kurumlar/kurum-listesi';

export const metadata: Metadata = { title: t('yonetim.nav.kurumlar') };

export default function Sayfa() {
  return <KurumListesiSayfasi />;
}
