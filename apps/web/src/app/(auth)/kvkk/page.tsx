import { t } from '@kopru/i18n';
import type { Metadata } from 'next';

import { KvkkIstemci } from './kvkk-istemci';

export const metadata: Metadata = { title: t('kvkk.baslik') };

export default function KvkkSayfasi() {
  return <KvkkIstemci />;
}
