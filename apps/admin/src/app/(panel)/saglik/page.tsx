import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { SaglikSayfasi } from '@/components/saglik/saglik-sayfasi';

export const metadata: Metadata = { title: t('yonetim.nav.saglik') };

export default function Sayfa() {
  return <SaglikSayfasi />;
}
