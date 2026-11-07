import type { ReactNode } from 'react';

export function SayfaBasligi({
  baslik,
  aciklama,
  children,
}: {
  baslik: string;
  aciklama?: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3 lg:mb-8">
      <div>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-3xl">
          {baslik}
        </h1>
        {aciklama ? <p className="mt-1.5 text-base text-metin-ikincil">{aciklama}</p> : null}
      </div>
      {children}
    </header>
  );
}
