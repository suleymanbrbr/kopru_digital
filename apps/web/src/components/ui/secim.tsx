import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

/** Yerel `<select>`: klavye ve ekran okuyucu destegi tarayicidan gelir. */
export function Secim({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        className={cn(
          'h-11 w-full appearance-none rounded-orta border border-kenar bg-yuzey pl-3 pr-9 text-base text-metin aria-invalid:border-hata disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-metin-ikincil"
        aria-hidden
      />
    </div>
  );
}
