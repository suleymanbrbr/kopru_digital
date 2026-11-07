import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { KurumSecIstemci } from './kurum-sec-istemci';

export const metadata: Metadata = { title: t('kurumSec.baslik') };

export default function KurumSecSayfasi() {
  return <KurumSecIstemci />;
}
