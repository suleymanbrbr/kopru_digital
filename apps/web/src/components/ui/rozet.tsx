import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

type Ton = 'notr' | 'basari' | 'uyari' | 'hata' | 'bilgi';

const tonlar: Record<Ton, string> = {
  notr: 'bg-yuzey-ikincil text-metin-ikincil',
  basari: 'bg-basari-yumusak text-metin',
  uyari: 'bg-uyari-yumusak text-metin',
  hata: 'bg-hata-yumusak text-hata',
  bilgi: 'bg-birincil-yumusak text-metin',
};

/** Kisa durum etiketi. Renk tek basina anlam tasimaz; metin her zaman vardir. */
export function Rozet({
  ton = 'notr',
  children,
  className,
}: {
  ton?: Ton;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        tonlar[ton],
        className,
      )}
    >
      {children}
    </span>
  );
}
