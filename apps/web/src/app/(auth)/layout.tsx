import { t } from '@kopru/i18n';
import type { ReactNode } from 'react';

import { MarkaAdi } from '@/components/marka';
import { TemaAnahtari } from '@/components/tema-anahtari';

/** Kemer cizgisi: kopru metaforu. Yalniz buyuk ekranlarda sol panelde gorunur. */
function KemerCizimi() {
  return (
    <svg
      viewBox="0 0 520 420"
      fill="none"
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 w-full text-marka-300"
      preserveAspectRatio="xMidYMax slice"
    >
      <g stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" opacity="0.55">
        <path
          pathLength="1"
          className="kemer-ciz"
          d="M-20 330C60 120 200 60 260 60s200 60 280 270"
        />
        <path
          pathLength="1"
          className="kemer-ciz"
          d="M20 330C90 160 200 110 260 110s170 50 240 220"
          opacity="0.7"
        />
        <path
          pathLength="1"
          className="kemer-ciz"
          d="M60 330C120 200 205 160 260 160s140 40 200 170"
          opacity="0.5"
        />
        <path d="M-20 330H540" />
        <path d="M120 330V210M190 330V140M260 330V110M330 330V140M400 330V210" opacity="0.35" />
      </g>
      <circle cx="260" cy="60" r="9" className="fill-vurgu" />
    </svg>
  );
}

export default function KimlikDuzeni({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-marka-900 p-12 text-notr-0 lg:flex lg:flex-col">
        <MarkaAdi />
        <div className="mt-auto mb-64 max-w-md">
          <p className="text-3xl font-semibold leading-tight tracking-tight">{t('marka.slogan')}</p>
          <p className="mt-4 text-base leading-relaxed text-marka-100/80">
            {t('marka.sloganAciklama')}
          </p>
        </div>
        <KemerCizimi />
      </aside>

      <div className="relative flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <MarkaAdi className="lg:invisible" />
          <TemaAnahtari />
        </div>
        <main
          id="icerik"
          className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
