import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

/** Cok satirli metin alani; `Girdi` ile ayni gorunum ve odak halkasi. */
export function MetinAlani({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-24 w-full rounded-orta border border-kenar bg-yuzey px-3 py-2.5 text-base text-metin placeholder:text-metin-ikincil/70 aria-invalid:border-hata disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
