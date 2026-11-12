'use client';

import { t } from '@kopru/i18n';
import { useId } from 'react';

import { radarHesapla } from '@/lib/motivasyon/radar';

const BOYUT = 240;

/**
 * Bes beceri icin beşgen (radar) grafik; SVG, kutuphanesiz. Gorsel `aria-hidden`; ayni veri gorunur
 * olmayan ama okunabilir bir listede ve gorunur bir ozet satirinda yer alir (metin alternatifi).
 * Baskasiyla kiyaslama yoktur: yalniz ogrencinin kendi puanlari.
 */
export function RadarGrafigi({
  beceriler,
}: {
  beceriler: readonly { kod: string; ad: string; puan: number }[];
}) {
  const baslikId = useId();
  const r = radarHesapla(beceriler, BOYUT);
  const merkez = BOYUT / 2;

  return (
    <figure aria-labelledby={baslikId} className="flex flex-col items-center gap-3">
      <figcaption id={baslikId} className="sr-only">
        {t('motivasyon.radar.alt')}
      </figcaption>
      <svg
        viewBox={`0 0 ${String(BOYUT)} ${String(BOYUT)}`}
        className="h-auto w-full max-w-72"
        aria-hidden
        focusable="false"
        data-testid="radar"
      >
        {r.halkalar.map((p, i) => (
          <polygon key={i} points={p} className="fill-none stroke-kenar" strokeWidth={1} />
        ))}
        {r.eksenler.map((e, i) => (
          <line
            key={i}
            x1={merkez}
            y1={merkez}
            x2={e.x}
            y2={e.y}
            className="stroke-kenar"
            strokeWidth={1}
          />
        ))}
        <polygon
          points={r.cokgen}
          className="fill-birincil/25 stroke-birincil"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {r.noktalar.map((n) => (
          <circle key={n.kod} cx={n.x} cy={n.y} r={3.5} className="fill-birincil" />
        ))}
        {r.noktalar.map((n) => (
          <text
            key={n.kod}
            x={n.etiketX}
            y={n.etiketY}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-metin text-[11px] font-medium"
          >
            {n.ad}
          </text>
        ))}
      </svg>
      <ul
        className="grid w-full grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3"
        data-testid="radar-liste"
      >
        {beceriler.map((b) => (
          <li key={b.kod} className="flex justify-between gap-2">
            <span className="text-metin-ikincil">{b.ad}</span>
            <span className="font-medium tabular-nums">{b.puan}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-metin-ikincil">{t('motivasyon.radar.olcek', { n: r.ustSinir })}</p>
    </figure>
  );
}
