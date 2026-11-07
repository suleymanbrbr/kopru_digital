import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { GirisAkisi } from '@/components/giris/giris-akisi';
import { Koruma } from '@/oturum/koruma';
import { mockModu } from '@/sunucu/kimlik';

export const metadata: Metadata = { title: t('giris.baslik') };

export default function GirisSayfasi() {
  const deneme = mockModu();
  return <Koruma ekran="giris">{() => <GirisAkisi denemeIpucu={deneme} />}</Koruma>;
}
