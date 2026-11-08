import type { ReactNode } from 'react';

import { cn } from '../cn';
import { markdownAyristir, type Blok, type Satir } from './ayristir';

function SatirlariCiz({ satirlar }: { satirlar: Satir[] }): ReactNode {
  return satirlar.map((s, i) => {
    switch (s.tur) {
      case 'metin':
        return s.metin;
      case 'kalin':
        return (
          <strong key={i} className="font-semibold text-metin">
            <SatirlariCiz satirlar={s.ic} />
          </strong>
        );
      case 'italik':
        return (
          <em key={i}>
            <SatirlariCiz satirlar={s.ic} />
          </em>
        );
      case 'baglanti':
        return (
          <a
            key={i}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-birincil underline underline-offset-2"
          >
            <SatirlariCiz satirlar={s.ic} />
          </a>
        );
    }
  });
}

const BASLIK_SINIF = {
  1: 'text-lg',
  2: 'text-base',
  3: 'text-[0.9375rem]',
  4: 'text-[0.9375rem]',
  5: 'text-[0.9375rem]',
  6: 'text-[0.9375rem]',
} as const;

function BloklariCiz({ bloklar, seviyeEki }: { bloklar: Blok[]; seviyeEki: number }): ReactNode {
  return bloklar.map((b, i) => {
    switch (b.tur) {
      case 'paragraf':
        return (
          <p key={i} className="whitespace-pre-line text-metin-ikincil">
            <SatirlariCiz satirlar={b.ic} />
          </p>
        );
      case 'baslik': {
        const seviye = Math.min(b.seviye + seviyeEki, 6) as 4 | 5 | 6;
        const Etiket = `h${seviye}` as const;
        return (
          <Etiket key={i} className={cn('mt-1 font-semibold text-metin', BASLIK_SINIF[b.seviye])}>
            <SatirlariCiz satirlar={b.ic} />
          </Etiket>
        );
      }
      case 'alinti':
        return (
          <blockquote key={i} className="flex flex-col gap-2 border-l-4 border-kenar pl-4 italic">
            <BloklariCiz bloklar={b.bloklar} seviyeEki={seviyeEki} />
          </blockquote>
        );
      case 'liste': {
        const Etiket = b.sirali ? 'ol' : 'ul';
        return (
          <Etiket
            key={i}
            start={b.sirali ? b.baslangic : undefined}
            className={cn(
              'flex flex-col gap-1 pl-6 text-metin-ikincil',
              b.sirali ? 'list-decimal' : 'list-disc',
            )}
          >
            {b.ogeler.map((oge, j) => (
              <li key={j} className="flex flex-col gap-1">
                <BloklariCiz bloklar={oge} seviyeEki={seviyeEki} />
              </li>
            ))}
          </Etiket>
        );
      }
      case 'duz':
        return (
          <p key={i} className="whitespace-pre-wrap text-metin-ikincil">
            {b.metin}
          </p>
        );
    }
  });
}

/**
 * Markdown'i HTML'e cevirmeden (dangerouslySetInnerHTML yok) React ogeleri olarak cizer.
 * `seviyeEki`: govde basliklarini sayfa hiyerarsisinin altina iter (`#` -> h(1+ek)); varsayilan
 * 3: ekran basligi h1, metin basligi h2, bolum basligi h3, govde basliklari h4 ve alti.
 */
export function Markdown({
  kaynak,
  seviyeEki = 3,
  className,
}: {
  kaynak: string;
  seviyeEki?: number;
  className?: string;
}) {
  const bloklar = markdownAyristir(kaynak);
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <BloklariCiz bloklar={bloklar} seviyeEki={seviyeEki} />
    </div>
  );
}
