'use client';

import { t } from '@kopru/i18n';
import { X } from 'lucide-react';
import { AlertDialog, Dialog } from 'radix-ui';
import type { ReactNode } from 'react';

import { Dugme } from '@/components/ui/button';
import { cn } from '@/lib/cn';

/** Ortalanmis pencere (form ve ayrintilar). Odak tuzagi, Esc ve geri odak Radix'ten gelir. */
export function Pencere({
  acik,
  degisti,
  baslik,
  aciklama,
  genis = false,
  children,
}: {
  acik: boolean;
  degisti: (acik: boolean) => void;
  baslik: string;
  aciklama?: string;
  genis?: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={acik} onOpenChange={degisti}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-notr-1000/50" />
        <Dialog.Content
          {...(aciklama ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-buyuk border border-kenar bg-yuzey p-5 shadow-xl',
            genis ? 'max-w-2xl' : 'max-w-md',
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-lg font-semibold">{baslik}</Dialog.Title>
              {aciklama ? (
                <Dialog.Description className="mt-1 text-sm text-metin-ikincil">
                  {aciklama}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close
              aria-label={t('ortak.kapat')}
              className="-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-orta text-metin-ikincil hover:bg-yuzey-ikincil"
            >
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Geri alinamayan ya da etkisi buyuk islemler icin onay penceresi. */
export function OnayPenceresi({
  acik,
  degisti,
  baslik,
  aciklama,
  onayEtiketi,
  tehlikeli = false,
  bekliyor = false,
  onay,
  icerik,
}: {
  acik: boolean;
  degisti: (acik: boolean) => void;
  baslik: string;
  aciklama: string;
  onayEtiketi: string;
  tehlikeli?: boolean;
  bekliyor?: boolean;
  onay: () => void;
  /** Aciklamanin altinda ek alan (ornegin zorunlu neden girdisi). */
  icerik?: ReactNode;
}) {
  return (
    <AlertDialog.Root open={acik} onOpenChange={degisti}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-notr-1000/50" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-buyuk border border-kenar bg-yuzey p-5 shadow-xl">
          <AlertDialog.Title className="text-lg font-semibold">{baslik}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-metin-ikincil">
            {aciklama}
          </AlertDialog.Description>
          {icerik}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Dugme gorunum="ikincil" disabled={bekliyor}>
                {t('ortak.vazgec')}
              </Dugme>
            </AlertDialog.Cancel>
            <Dugme gorunum={tehlikeli ? 'tehlike' : 'birincil'} disabled={bekliyor} onClick={onay}>
              {bekliyor ? t('ortak.yukleniyor') : onayEtiketi}
            </Dugme>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
