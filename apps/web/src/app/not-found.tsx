import { t } from '@kopru/i18n';
import Link from 'next/link';

import { dugmeStili } from '@/components/ui/button';

export default function BulunamadiSayfasi() {
  return (
    <main
      id="icerik"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center"
    >
      <h1 className="text-2xl font-semibold">{t('hata.bulunamadiBaslik')}</h1>
      <p className="mt-2 text-metin-ikincil">{t('hata.bulunamadiAciklama')}</p>
      <Link href="/kurum-sec" className={dugmeStili({ className: 'mt-6' })}>
        {t('hata.anaSayfa')}
      </Link>
    </main>
  );
}
