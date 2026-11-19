import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

const TON = {
  notr: 'bg-yuzey-ikincil text-metin',
  basari: 'bg-basari-yumusak text-basari dark:text-basari-100',
  uyari: 'border border-uyari/50 bg-uyari-yumusak text-metin',
  hata: 'bg-hata-yumusak text-hata',
  bilgi: 'bg-birincil-yumusak text-birincil',
} as const;

export type RozetTonu = keyof typeof TON;

export function Rozet({
  ton = 'notr',
  className,
  children,
}: {
  ton?: RozetTonu;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-tam px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TON[ton],
        className,
      )}
    >
      {children}
    </span>
  );
}
