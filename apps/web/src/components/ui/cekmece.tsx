'use client';

import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/** Alttan acilan cekmece (mobil menu). Odak tuzagi ve Esc ile kapanma Radix'ten gelir. */
export function Cekmece({
  acik,
  degisti,
  baslik,
  kapatEtiketi,
  children,
}: {
  acik: boolean;
  degisti: (acik: boolean) => void;
  baslik: string;
  kapatEtiketi: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={acik} onOpenChange={degisti}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-notr-1000/50" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-buyuk border-t border-kenar bg-yuzey p-4 pb-[max(1rem,env(safe-area-inset-bottom))]',
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">{baslik}</Dialog.Title>
            <Dialog.Close
              aria-label={kapatEtiketi}
              className="flex size-11 items-center justify-center rounded-orta text-metin-ikincil hover:bg-yuzey-ikincil"
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
