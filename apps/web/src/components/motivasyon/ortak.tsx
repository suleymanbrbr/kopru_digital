'use client';

import { t, type MessageKey } from '@kopru/i18n';
import type { ReactNode } from 'react';

import { Karakter, type KarakterAsamasi, type KarakterTuru } from '@/components/karakter';
import { cn } from '@/lib/cn';

/**
 * Ilerleme cubugu: renk tek basina anlam tasimaz; `etiket` ve gorunur `metin` her zaman vardir,
 * `role="progressbar"` ekran okuyucuya deger ve alt/ust siniri verir.
 */
export function Ilerleme({
  deger,
  ust,
  etiket,
  metin,
  className,
  ton = 'birincil',
}: {
  deger: number;
  ust: number;
  etiket: string;
  /** Cubugun yanindaki gorunur metin (ornegin "12 / 20 dk"). */
  metin?: ReactNode;
  className?: string;
  ton?: 'birincil' | 'basari' | 'vurgu';
}) {
  const yuzde = ust > 0 ? Math.min(100, Math.max(0, Math.round((deger / ust) * 100))) : 0;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        role="progressbar"
        aria-label={etiket}
        aria-valuemin={0}
        aria-valuemax={ust}
        aria-valuenow={Math.min(deger, ust)}
        aria-valuetext={t('motivasyon.ilerlemeMetni', { deger: Math.min(deger, ust), ust })}
        className="h-2.5 w-full overflow-hidden rounded-full bg-yuzey-ikincil"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500',
            ton === 'basari' ? 'bg-basari' : ton === 'vurgu' ? 'bg-uyari' : 'bg-birincil',
          )}
          style={{ width: `${String(yuzde)}%` }}
        />
      </div>
      {metin ? <p className="text-sm text-metin-ikincil">{metin}</p> : null}
    </div>
  );
}

/** Sunucudan gelen karakter turu kodu bilinen uc turden biri degilse ilkine duser. */
export function karakterTuru(kod: string): KarakterTuru {
  return kod === 'dinamo' || kod === 'sedir' ? kod : 'kivilcim';
}

export function karakterAsamasi(asama: number): KarakterAsamasi {
  return Math.min(5, Math.max(1, Math.round(asama))) as KarakterAsamasi;
}

/** Sunucudan gelen karakter (tur kodu + asama) icin yer tutucu cizim. */
export function KarakterGorseli({
  turKodu,
  asama,
  boyut = 160,
  oncelikli,
  kusanilanlar,
  adlar,
}: {
  turKodu: string;
  asama: number;
  boyut?: number;
  oncelikli?: boolean;
  kusanilanlar?: readonly { slot: string; kozmetik_kodu: string }[];
  /** Kozmetik kodu -> Turkce ad (yoksa yuva adi gosterilir). */
  adlar?: Readonly<Record<string, string>>;
}) {
  return (
    <span className="relative inline-block">
      <Karakter
        tur={karakterTuru(turKodu)}
        asama={karakterAsamasi(asama)}
        boyut={boyut}
        {...(oncelikli ? { oncelikli } : {})}
      />
      {kusanilanlar && kusanilanlar.length > 0 ? (
        <span className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 gap-1" aria-hidden>
          {kusanilanlar.map((k) => (
            <span
              key={k.slot}
              data-testid={`kusanim-${k.slot}`}
              className="rounded-full bg-yuzey px-1.5 py-0.5 text-[0.6875rem] font-medium text-metin-ikincil ring-1 ring-kenar"
            >
              {adlar?.[k.kozmetik_kodu] ?? t(`motivasyon.kozmetik.slot.${k.slot}` as MessageKey)}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}
