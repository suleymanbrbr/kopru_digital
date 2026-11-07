import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { GirisIstemci } from './giris-istemci';

import { mockModu } from '@/sunucu/kimlik';

export const metadata: Metadata = { title: t('giris.baslik') };

export default function GirisSayfasi() {
  return <GirisIstemci denemeIpucu={mockModu()} />;
}
