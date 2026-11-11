'use client';

import { t } from '@kopru/i18n';
import { Tabs } from 'radix-ui';
import type { ReactNode } from 'react';

import { Alan } from '@/components/operasyon/ortak';
import { Secim } from '@/components/ui/secim';
import { cn } from '@/lib/cn';

export interface SekmeTanimi {
  anahtar: string;
  etiket: string;
  icerik: ReactNode;
}

/** Erisilebilir sekmeler (Radix Tabs): ok tuslari ile gezinme ve `tabpanel` iliskisi hazir gelir. */
export function Sekmeler({
  deger,
  degisti,
  etiket,
  sekmeler,
}: {
  deger: string;
  degisti: (anahtar: string) => void;
  etiket: string;
  sekmeler: readonly SekmeTanimi[];
}) {
  return (
    <Tabs.Root value={deger} onValueChange={degisti}>
      <Tabs.List
        aria-label={etiket}
        className="mb-4 flex gap-1 overflow-x-auto border-b border-kenar"
      >
        {sekmeler.map((s) => (
          <Tabs.Trigger
            key={s.anahtar}
            value={s.anahtar}
            className={cn(
              'min-h-11 shrink-0 border-b-2 border-transparent px-3.5 text-sm font-medium text-metin-ikincil hover:text-metin',
              'data-[state=active]:border-birincil data-[state=active]:text-metin',
            )}
          >
            {s.etiket}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {sekmeler.map((s) => (
        <Tabs.Content key={s.anahtar} value={s.anahtar} className="focus-visible:outline-offset-4">
          {deger === s.anahtar ? s.icerik : null}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}

/** Ogrenci secimi: etiketli `<select>`; secenekler Turkce sirali verilir. */
export function OgrenciSecimi({
  deger,
  degisti,
  ogrenciler,
  etiket = t('ogrenme.ortak.ogrenci'),
  bosEtiket = t('ogrenme.ortak.ogrenciSec'),
  hata,
}: {
  deger: string;
  degisti: (id: string) => void;
  ogrenciler: readonly { id: string; ad: string }[];
  etiket?: string;
  bosEtiket?: string;
  hata?: string | undefined;
}) {
  return (
    <Alan etiket={etiket} hata={hata}>
      {(o) => (
        <Secim
          {...o}
          value={deger}
          onChange={(e) => {
            degisti(e.target.value);
          }}
        >
          <option value="">{bosEtiket}</option>
          {ogrenciler.map((x) => (
            <option key={x.id} value={x.id}>
              {x.ad}
            </option>
          ))}
        </Secim>
      )}
    </Alan>
  );
}

/** 0-1 orani yuzde metnine cevirir (`%85`); bos deger `-`. */
export function yuzdeMetni(oran: number | null | undefined): string {
  return oran === null || oran === undefined ? '-' : `%${String(Math.round(oran * 100))}`;
}

/** Tarih (`YYYY-MM-DD`) kisa Turkce gosterimi. */
export function kisaTarih(tarih: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${tarih}T00:00:00Z`));
}
