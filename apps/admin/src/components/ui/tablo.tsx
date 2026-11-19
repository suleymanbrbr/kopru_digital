import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/cn';

/** Genis tablolar kendi icinde yatay kayar (sayfa tasmaz); klavye ile odaklanip kaydirilabilir. */
export function Tablo({
  etiket,
  className,
  children,
}: {
  etiket: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={etiket}
      tabIndex={0}
      className={cn('overflow-x-auto rounded-orta border border-kenar', className)}
    >
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-kenar bg-yuzey-ikincil px-3 py-2 text-xs font-semibold whitespace-nowrap text-metin-ikincil',
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('border-b border-kenar px-3 py-2.5 align-top', className)} {...props} />;
}
