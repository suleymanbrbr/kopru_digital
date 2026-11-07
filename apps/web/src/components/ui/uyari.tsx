import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/** Satir ici hata/uyari. Ekran okuyucuya hemen okunur (role="alert"). */
export function Uyari({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-orta bg-hata-yumusak px-3 py-2.5 text-sm text-hata',
        className,
      )}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
