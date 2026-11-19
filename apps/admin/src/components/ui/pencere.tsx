'use client';

import { t } from '@kopru/i18n';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

import { Dugme } from './dugme';

import { cn } from '@/lib/cn';

/**
 * Modal pencere (yerlesik `<dialog>`: odak tuzagi, Esc ve arka plan tarayicidan). Icerik yalniz acikken
 * baglanir; her acilista form durumu sifirlanir.
 */
export function Pencere({
  acik,
  onKapat,
  baslik,
  aciklama,
  genis = false,
  children,
}: {
  acik: boolean;
  onKapat: () => void;
  baslik: string;
  aciklama?: ReactNode;
  genis?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const baslikId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (acik && !d.open) d.showModal();
    if (!acik && d.open) d.close();
  }, [acik]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={baslikId}
      onCancel={(e) => {
        e.preventDefault();
        onKapat();
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-buyuk border border-kenar bg-yuzey p-0 text-metin shadow-xl backdrop:bg-black/50',
        genis ? 'max-w-2xl' : 'max-w-lg',
      )}
    >
      {acik ? (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={baslikId} className="text-lg font-semibold">
                {baslik}
              </h2>
              {aciklama ? <div className="mt-1 text-sm text-metin-ikincil">{aciklama}</div> : null}
            </div>
            <Dugme
              gorunum="hayalet"
              boyut="sm"
              className="-mr-2 -mt-1 size-9 px-0"
              onClick={onKapat}
              aria-label={t('yonetim.ortak.kapat')}
            >
              <X aria-hidden />
            </Dugme>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
