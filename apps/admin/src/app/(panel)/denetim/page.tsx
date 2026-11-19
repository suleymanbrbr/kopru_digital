import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { DenetimSayfasi } from '@/components/denetim/denetim-sayfasi';

export const metadata: Metadata = { title: t('yonetim.nav.denetim') };

export default function Sayfa() {
  return <DenetimSayfasi />;
}
