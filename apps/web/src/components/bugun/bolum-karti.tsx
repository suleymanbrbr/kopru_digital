import type { ReactNode } from 'react';

import { HataDurumu } from '@/components/hata-durumu';
import { Iskelet, Kart } from '@/components/ui/kart';

/** Bugun ekranindaki liste karti: baslik + yukleniyor / hata / icerik durumlari. */
export function BolumKarti({
  baslik,
  yukleniyor,
  hata,
  tekrarDene,
  children,
}: {
  baslik: string;
  yukleniyor: boolean;
  hata: boolean;
  tekrarDene: () => void;
  children: ReactNode;
}) {
  const id = `baslik-${baslik.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <Kart aria-labelledby={id} className="flex flex-col">
      <h2 id={id} className="border-b border-kenar px-5 py-4 text-base font-semibold">
        {baslik}
      </h2>
      <div className="flex flex-1 flex-col justify-center">
        {yukleniyor ? (
          <div className="flex flex-col gap-3 p-5" role="status">
            <Iskelet className="h-5 w-3/4" />
            <Iskelet className="h-5 w-1/2" />
            <Iskelet className="h-5 w-2/3" />
          </div>
        ) : hata ? (
          <HataDurumu tekrarDene={tekrarDene} className="py-8" />
        ) : (
          children
        )}
      </div>
    </Kart>
  );
}
