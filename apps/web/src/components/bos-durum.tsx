import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/** Bos liste ya da henuz veri olmayan bolum: ne oldugunu soyler, sonraki adimi onerir. */
export function BosDurum({
  ikon: Ikon,
  baslik,
  aciklama,
  children,
  className,
}: {
  ikon: LucideIcon;
  baslik: string;
  aciklama?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-4 py-8 text-center', className)}>
      <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-yuzey-ikincil text-metin-ikincil">
        <Ikon className="size-6" aria-hidden />
      </span>
      <h3 className="text-base font-semibold">{baslik}</h3>
      {aciklama ? <p className="mt-1 max-w-xs text-sm text-metin-ikincil">{aciklama}</p> : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
