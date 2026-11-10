import { t } from '@kopru/i18n';

import { netMetni } from '@/lib/ogrenme/net';

export interface GrafikSerisi {
  ad: string;
  /** CSS rengi (tema degiskeni); renk tek basina anlam tasimaz, seri adi ve cizgi stili de ayirir. */
  renk: string;
  kesik?: string;
  /** `etiketler` ile ayni uzunluk; veri olmayan nokta `null`. */
  degerler: readonly (number | null)[];
}

const G = 640;
const Y = 260;
const SOL = 44;
const SAG = 16;
const UST = 16;
const ALT = 44;

function yTikleri(min: number, max: number): { alt: number; ust: number; tikler: number[] } {
  const aralik = Math.max(max - min, 1);
  const adim = [1, 2, 5, 10, 20, 25, 50, 100].find((a) => aralik / a <= 5) ?? 100;
  const alt = Math.floor(min / adim) * adim;
  const ust = Math.ceil(max / adim) * adim || adim;
  const tikler: number[] = [];
  for (let v = alt; v <= ust + 1e-9; v += adim) tikler.push(v);
  return { alt, ust: ust === alt ? alt + adim : ust, tikler };
}

/**
 * Elle cizilmis SVG cizgi grafigi (bagimlilik yok). Erisilebilirlik: `role="img"` + ozet etiketi, ve
 * ayni veriyi veren acilir tablo ("Tablo olarak goster"). Renkler tema degiskenleridir (acik/koyu).
 */
export function CizgiGrafigi({
  baslik,
  etiketler,
  seriler,
}: {
  baslik: string;
  etiketler: readonly string[];
  seriler: readonly GrafikSerisi[];
}) {
  const degerler = seriler.flatMap((s) => s.degerler).filter((d): d is number => d !== null);
  if (etiketler.length === 0 || degerler.length === 0) return null;
  const { alt, ust, tikler } = yTikleri(Math.min(...degerler), Math.max(...degerler));
  const x = (i: number) =>
    etiketler.length === 1
      ? SOL + (G - SOL - SAG) / 2
      : SOL + (i * (G - SOL - SAG)) / (etiketler.length - 1);
  const y = (v: number) => UST + ((ust - v) * (Y - UST - ALT)) / (ust - alt);
  const ozet = seriler
    .map((s) => {
      const son = [...s.degerler].reverse().find((d): d is number => d !== null);
      return `${s.ad}: ${son === undefined ? '-' : netMetni(son)}`;
    })
    .join('; ');

  return (
    <figure className="flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${String(G)} ${String(Y)}`}
        role="img"
        aria-label={t('ogrenme.deneme.grafikEtiket', { baslik, ozet })}
        className="h-auto w-full"
      >
        <title>{baslik}</title>
        {tikler.map((v) => (
          <g key={v}>
            <line x1={SOL} x2={G - SAG} y1={y(v)} y2={y(v)} stroke="var(--kenar)" strokeWidth={1} />
            <text
              x={SOL - 8}
              y={y(v) + 4}
              textAnchor="end"
              fontSize={12}
              fill="var(--metin-ikincil)"
            >
              {String(v)}
            </text>
          </g>
        ))}
        {etiketler.map((e, i) => (
          <text
            key={`${e}-${String(i)}`}
            x={x(i)}
            y={Y - ALT + 20}
            textAnchor="middle"
            fontSize={12}
            fill="var(--metin-ikincil)"
          >
            {e.length > 12 ? `${e.slice(0, 11)}…` : e}
          </text>
        ))}
        {seriler.map((s) => {
          const noktalar = s.degerler.flatMap((d, i) => (d === null ? [] : [{ i, d }]));
          return (
            <g key={s.ad}>
              <polyline
                fill="none"
                stroke={s.renk}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                {...(s.kesik ? { strokeDasharray: s.kesik } : {})}
                points={noktalar.map((n) => `${String(x(n.i))},${String(y(n.d))}`).join(' ')}
              />
              {noktalar.map((n) => (
                <circle
                  key={n.i}
                  cx={x(n.i)}
                  cy={y(n.d)}
                  r={4}
                  fill="var(--yuzey)"
                  stroke={s.renk}
                  strokeWidth={2.5}
                />
              ))}
            </g>
          );
        })}
      </svg>
      <ul
        className="flex flex-wrap gap-x-4 gap-y-1 text-sm"
        aria-label={t('ogrenme.deneme.grafikLejant')}
      >
        {seriler.map((s) => (
          <li key={s.ad} className="flex items-center gap-2">
            <svg width="28" height="8" aria-hidden>
              <line
                x1="0"
                x2="28"
                y1="4"
                y2="4"
                stroke={s.renk}
                strokeWidth={3}
                {...(s.kesik ? { strokeDasharray: s.kesik } : {})}
              />
            </svg>
            {s.ad}
          </li>
        ))}
      </ul>
      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer py-2 font-medium">
          {t('ogrenme.deneme.tabloGoster')}
        </summary>
        <div
          tabIndex={0}
          role="region"
          aria-label={t('ogrenme.deneme.tabloGoster')}
          className="overflow-x-auto"
        >
          <table className="w-full text-left">
            <caption className="sr-only">{baslik}</caption>
            <thead className="text-xs uppercase tracking-wide text-metin-ikincil">
              <tr>
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  {t('ogrenme.deneme.deneme')}
                </th>
                {seriler.map((s) => (
                  <th key={s.ad} scope="col" className="py-1.5 pr-3 font-medium">
                    {s.ad}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-kenar">
              {etiketler.map((e, i) => (
                <tr key={`${e}-${String(i)}`}>
                  <th scope="row" className="py-1.5 pr-3 font-medium">
                    {e}
                  </th>
                  {seriler.map((s) => (
                    <td key={s.ad} className="py-1.5 pr-3">
                      {s.degerler[i] === null || s.degerler[i] === undefined
                        ? '-'
                        : netMetni(s.degerler[i])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
