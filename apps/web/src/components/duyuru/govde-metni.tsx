import { t } from '@kopru/i18n';
import { Fragment } from 'react';

import { cn } from '@/lib/cn';
import { govdeyiParcala } from '@/lib/duyuru/govde';

/**
 * Duyuru metni: satir sonlari korunur, `http(s)` adresleri tiklanabilir olur (yeni sekme,
 * `noopener noreferrer`). Metin HTML olarak yorumlanmaz; `javascript:` vb. adresler duz metin kalir.
 */
export function GovdeMetni({ govde, className }: { govde: string; className?: string }) {
  return (
    <p className={cn('whitespace-pre-wrap break-words', className)}>
      {govdeyiParcala(govde).map((p, i) =>
        p.tur === 'baglanti' ? (
          <a
            key={i}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-birincil underline underline-offset-2"
          >
            {p.metin}
            <span className="sr-only"> {t('duyurular.yeniSekme')}</span>
          </a>
        ) : (
          <Fragment key={i}>{p.metin}</Fragment>
        ),
      )}
    </p>
  );
}
