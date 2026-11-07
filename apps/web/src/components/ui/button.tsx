import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

export const dugmeStili = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-orta font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      gorunum: {
        birincil: 'bg-birincil text-birincil-uzeri hover:bg-birincil/90',
        ikincil: 'border border-kenar bg-yuzey text-metin hover:bg-yuzey-ikincil',
        hayalet: 'text-metin-ikincil hover:bg-yuzey-ikincil hover:text-metin',
        tehlike: 'bg-hata text-birincil-uzeri hover:bg-hata/90',
      },
      boyut: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-4 text-sm',
        lg: 'h-12 px-5 text-base',
        ikon: 'size-11',
      },
    },
    defaultVariants: { gorunum: 'birincil', boyut: 'md' },
  },
);

export interface DugmeProps extends ComponentProps<'button'>, VariantProps<typeof dugmeStili> {
  asChild?: boolean;
}

export function Dugme({ className, gorunum, boyut, asChild = false, ...props }: DugmeProps) {
  const Bilesen = asChild ? Slot.Root : 'button';
  return <Bilesen className={cn(dugmeStili({ gorunum, boyut }), className)} {...props} />;
}
