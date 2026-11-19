import { useId, type ComponentProps, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

const GIRDI =
  'w-full rounded-orta border border-kenar bg-yuzey px-3 text-sm text-metin placeholder:text-metin-ikincil aria-[invalid=true]:border-hata disabled:opacity-60';

interface OrtakProps {
  etiket: string;
  yardim?: string | undefined;
  hata?: string | undefined;
  kapsayiciSinifi?: string | undefined;
}

function Sarmal({
  etiket,
  yardim,
  hata,
  kapsayiciSinifi,
  id,
  children,
}: OrtakProps & { id: string; children: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-1.5', kapsayiciSinifi)}>
      <label htmlFor={id} className="text-sm font-medium">
        {etiket}
      </label>
      {children}
      {yardim ? (
        <p id={`${id}-yardim`} className="text-xs text-metin-ikincil">
          {yardim}
        </p>
      ) : null}
      {hata ? (
        <p id={`${id}-hata`} className="text-xs font-medium text-hata">
          {hata}
        </p>
      ) : null}
    </div>
  );
}

const betimle = (id: string, yardim?: string, hata?: string) =>
  [yardim ? `${id}-yardim` : null, hata ? `${id}-hata` : null].filter(Boolean).join(' ') ||
  undefined;

/** Etiketli tek satirlik girdi. */
export function Alan({
  etiket,
  yardim,
  hata,
  kapsayiciSinifi,
  className,
  ...props
}: OrtakProps & Omit<ComponentProps<'input'>, 'id'>) {
  const id = useId();
  return (
    <Sarmal {...{ etiket, yardim, hata, kapsayiciSinifi, id }}>
      <input
        id={id}
        aria-invalid={hata ? true : undefined}
        aria-describedby={betimle(id, yardim, hata)}
        className={cn(GIRDI, 'h-11', className)}
        {...props}
      />
    </Sarmal>
  );
}

export function MetinAlani({
  etiket,
  yardim,
  hata,
  kapsayiciSinifi,
  className,
  ...props
}: OrtakProps & Omit<ComponentProps<'textarea'>, 'id'>) {
  const id = useId();
  return (
    <Sarmal {...{ etiket, yardim, hata, kapsayiciSinifi, id }}>
      <textarea
        id={id}
        aria-invalid={hata ? true : undefined}
        aria-describedby={betimle(id, yardim, hata)}
        className={cn(GIRDI, 'min-h-24 py-2', className)}
        {...props}
      />
    </Sarmal>
  );
}

export function Secim({
  etiket,
  yardim,
  hata,
  kapsayiciSinifi,
  className,
  children,
  ...props
}: OrtakProps & Omit<ComponentProps<'select'>, 'id'>) {
  const id = useId();
  return (
    <Sarmal {...{ etiket, yardim, hata, kapsayiciSinifi, id }}>
      <select
        id={id}
        aria-invalid={hata ? true : undefined}
        aria-describedby={betimle(id, yardim, hata)}
        className={cn(GIRDI, 'h-11', className)}
        {...props}
      >
        {children}
      </select>
    </Sarmal>
  );
}
