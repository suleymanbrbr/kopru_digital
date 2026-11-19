import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

const GORUNUM = {
  birincil: 'bg-birincil text-birincil-uzeri hover:bg-birincil/90',
  ikincil: 'border border-kenar bg-yuzey text-metin hover:bg-yuzey-ikincil',
  hayalet: 'text-metin-ikincil hover:bg-yuzey-ikincil hover:text-metin',
  tehlike: 'bg-hata text-birincil-uzeri hover:bg-hata/90',
} as const;

const BOYUT = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
} as const;

export interface DugmeProps extends ComponentProps<'button'> {
  gorunum?: keyof typeof GORUNUM;
  boyut?: keyof typeof BOYUT;
}

export function Dugme({
  className,
  gorunum = 'birincil',
  boyut = 'md',
  type,
  ...props
}: DugmeProps) {
  return (
    <button
      type={type ?? 'button'}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-orta font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        GORUNUM[gorunum],
        BOYUT[boyut],
        className,
      )}
      {...props}
    />
  );
}
