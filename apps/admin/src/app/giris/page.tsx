import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { GirisFormu } from '@/components/kimlik/giris';

export const metadata: Metadata = { title: t('yonetim.giris.baslik') };

export default function GirisSayfasi() {
  return <GirisFormu />;
}
