import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

export function Kart({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section className={cn('rounded-buyuk border border-kenar bg-yuzey', className)} {...props} />
  );
}

export function Iskelet({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-orta bg-yuzey-ikincil', className)}
      {...props}
    />
  );
}
