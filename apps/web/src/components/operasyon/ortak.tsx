'use client';

import { t } from '@kopru/i18n';
import { useId, type ReactNode } from 'react';

import { Etiket } from '@/components/ui/input';
import { cn } from '@/lib/cn';

interface AlanOzellikleri {
  id: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}

/** Etiket + denetim + yardim/hata metni; hata `aria-describedby` ile denetime baglanir. */
export function Alan({
  etiket,
  hata,
  yardim,
  className,
  children,
}: {
  etiket: string;
  hata?: string | undefined;
  yardim?: string;
  className?: string;
  children: (ozellikler: AlanOzellikleri) => ReactNode;
}) {
  const kimlik = useId();
  const hataId = `${kimlik}-hata`;
  const yardimId = `${kimlik}-yardim`;
  const betimleme = [hata ? hataId : null, yardim ? yardimId : null].filter(Boolean).join(' ');
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Etiket htmlFor={kimlik}>{etiket}</Etiket>
      {children({
        id: kimlik,
        ...(hata ? { 'aria-invalid': true as const } : {}),
        ...(betimleme ? { 'aria-describedby': betimleme } : {}),
      })}
      {yardim ? (
        <p id={yardimId} className="text-xs text-metin-ikincil">
          {yardim}
        </p>
      ) : null}
      {hata ? (
        <p id={hataId} className="text-sm text-hata">
          {hata}
        </p>
      ) : null}
    </div>
  );
}

export type Kapsam = 'yalniz_bu' | 'bu_ve_sonrakiler';

/** Seri derste "yalniz bu / bu ve sonrakiler" secimi. */
export function KapsamSecimi({
  deger,
  degisti,
  sonrakilerEtiketi = t('operasyon.takvim.kapsam.buVeSonrakiler'),
}: {
  deger: Kapsam;
  degisti: (k: Kapsam) => void;
  sonrakilerEtiketi?: string;
}) {
  const ad = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{t('operasyon.takvim.kapsam.baslik')}</legend>
      {(
        [
          ['yalniz_bu', t('operasyon.takvim.kapsam.yalnizBu')],
          ['bu_ve_sonrakiler', sonrakilerEtiketi],
        ] as const
      ).map(([k, etiket]) => (
        <label
          key={k}
          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-orta border border-kenar px-3 text-sm has-[:checked]:border-birincil has-[:checked]:bg-birincil-yumusak"
        >
          <input
            type="radio"
            name={ad}
            value={k}
            checked={deger === k}
            onChange={() => {
              degisti(k);
            }}
            className="size-4 accent-[var(--birincil)]"
          />
          {etiket}
        </label>
      ))}
    </fieldset>
  );
}

/** Yapilandirilmis ek ayrinti satiri (etiket: deger). */
export function Satir({ etiket, children }: { etiket: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-32 shrink-0 text-sm text-metin-ikincil">{etiket}</dt>
      <dd className="min-w-0 text-sm font-medium">{children}</dd>
    </div>
  );
}
