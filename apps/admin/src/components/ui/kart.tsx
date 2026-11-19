import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/cn';

export function Kart({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn('rounded-buyuk border border-kenar bg-yuzey p-4 sm:p-5', className)}
      {...props}
    />
  );
}

export function KartBasligi({
  baslik,
  aciklama,
  sag,
  id,
}: {
  baslik: string;
  aciklama?: string | undefined;
  sag?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="text-lg font-semibold">
          {baslik}
        </h2>
        {aciklama ? <p className="mt-0.5 text-sm text-metin-ikincil">{aciklama}</p> : null}
      </div>
      {sag}
    </div>
  );
}

export function SayfaBasligi({
  baslik,
  aciklama,
  sag,
}: {
  baslik: string;
  aciklama?: string | undefined;
  sag?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{baslik}</h1>
        {aciklama ? <p className="mt-1 text-sm text-metin-ikincil">{aciklama}</p> : null}
      </div>
      {sag}
    </header>
  );
}
