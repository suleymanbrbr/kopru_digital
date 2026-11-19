'use client';

import { t } from '@kopru/i18n';
import { PauseCircle } from 'lucide-react';
import Link from 'next/link';

import { BosDurum } from '@/components/bos-durum';
import { dugmeStili } from '@/components/ui/button';

/** `403 kurum_askida`: platform yonetimi kurumu askiya aldi. Veri silinmedi; aciklama ve cikis yolu. */
export function AskiEkrani() {
  return (
    <main id="icerik" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <BosDurum
        ikon={PauseCircle}
        baslik={t('abonelik.askiBaslik')}
        aciklama={t('abonelik.askiAciklama')}
      >
        <p className="mb-4 text-sm text-metin-ikincil">{t('abonelik.askiDestek')}</p>
        <Link href="/kurum-sec" className={dugmeStili({ gorunum: 'ikincil' })}>
          {t('kurumSec.kurumListesi')}
        </Link>
      </BosDurum>
    </main>
  );
}
