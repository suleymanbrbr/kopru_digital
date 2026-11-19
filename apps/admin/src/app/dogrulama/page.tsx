import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { IkinciAdimSayfasi } from '@/components/kimlik/ikinci-adim';

export const metadata: Metadata = { title: t('yonetim.ikinciAdim.baslik') };

export default function DogrulamaSayfasi() {
  return <IkinciAdimSayfasi />;
}
