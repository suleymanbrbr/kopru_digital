import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { KatalogListesiSayfasi } from '@/components/mufredat/katalog-listesi';

export const metadata: Metadata = { title: t('yonetim.nav.mufredat') };

export default function Sayfa() {
  return <KatalogListesiSayfasi />;
}
