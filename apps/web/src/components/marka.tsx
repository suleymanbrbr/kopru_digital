import { t } from '@kopru/i18n';

import { cn } from '@/lib/cn';

/** Kopru isareti: iki ayak arasinda kemer ve uzerinde vurgu noktasi. */
export function MarkaIsareti({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={cn('size-8', className)}>
      <rect width="32" height="32" rx="9" className="fill-birincil" />
      <path
        d="M6 23.5h20M8 23.5C8 15 12 11 16 11s8 4 8 12.5"
        stroke="var(--birincil-uzeri)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="7.2" r="2.2" fill="var(--vurgu)" />
    </svg>
  );
}

export function MarkaAdi({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <MarkaIsareti />
      <span className="text-lg font-semibold tracking-tight">{t('marka.ad')}</span>
    </span>
  );
}
