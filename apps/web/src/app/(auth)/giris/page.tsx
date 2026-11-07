import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { mockModu } from '@/sunucu/kimlik';

import { GirisIstemci } from './giris-istemci';

export const metadata: Metadata = { title: t('giris.baslik') };

export default function GirisSayfasi() {
  return <GirisIstemci denemeIpucu={mockModu()} />;
}
