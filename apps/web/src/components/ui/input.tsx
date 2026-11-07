import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

export function Girdi({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-orta border border-kenar bg-yuzey px-3 text-base text-metin placeholder:text-metin-ikincil/70 aria-invalid:border-hata disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function Etiket({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-sm font-medium text-metin', className)} {...props} />;
}
