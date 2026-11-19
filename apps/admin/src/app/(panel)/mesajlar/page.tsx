import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { MesajlarSayfasi } from '@/components/mesajlar/mesajlar-sayfasi';

export const metadata: Metadata = { title: t('yonetim.nav.mesajlar') };

export default function Sayfa() {
  return <MesajlarSayfasi />;
}
