import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { YuvaEkrani } from '@/components/motivasyon/yuva-ekrani';

export const metadata: Metadata = { title: t('motivasyon.yuva.baslik') };

export default function KarakterimSayfasi() {
  return <YuvaEkrani />;
}
