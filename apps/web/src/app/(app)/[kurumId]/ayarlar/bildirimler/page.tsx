import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { BildirimTercihleri } from '@/components/bildirim/bildirim-tercihleri';

export const metadata: Metadata = { title: t('bildirim.ayarlar.baslik') };

export default function BildirimTercihleriSayfasi() {
  return <BildirimTercihleri />;
}
