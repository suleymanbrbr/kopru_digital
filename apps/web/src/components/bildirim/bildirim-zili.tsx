'use client';

import { t } from '@kopru/i18n';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { Popover } from 'radix-ui';
import { useState } from 'react';

import { BildirimSatiri } from './bildirim-satiri';

import { Iskelet } from '@/components/ui/kart';
import { useKurum } from '@/kurum/baglam';
import { bildirimlerYolu } from '@/lib/bildirim/derin-baglanti';
import {
  useOkunduIsaretle,
  useOkunmamisSayisi,
  useSonBildirimler,
  useTumunuOku,
} from '@/lib/bildirim/veri';
import { cn } from '@/lib/cn';

/** Rozet sayisi: 99'dan fazlasi "99+". */
export function rozetMetni(sayi: number): string {
  return sayi > 99 ? '99+' : String(sayi);
}

/**
 * Ust cubuktaki zil: okunmamis sayisi rozeti (60 sn'de bir ve sekme odaklaninca tazelenir) ve son
 * bildirimlerin acilir listesi. Sayi hatasi sessizdir; liste hatasi liste icinde gosterilir.
 */
export function BildirimZili({ className }: { className?: string }) {
  const { uyelik, rol } = useKurum();
  const kurumId = uyelik.kurumId;
  const [acik, setAcik] = useState(false);
  const sayiSorgusu = useOkunmamisSayisi(kurumId);
  const liste = useSonBildirimler(kurumId, acik);
  const okundu = useOkunduIsaretle(kurumId);
  const tumunu = useTumunuOku(kurumId);
  const sayi = sayiSorgusu.data?.okunmamis ?? 0;
  const etiket = sayi > 0 ? t('bildirim.zil.etiketOkunmamis', { sayi }) : t('bildirim.zil.etiket');

  return (
    <Popover.Root open={acik} onOpenChange={setAcik}>
      <Popover.Trigger
        aria-label={etiket}
        data-testid="bildirim-zili"
        className={cn(
          'relative flex size-11 items-center justify-center rounded-orta text-metin-ikincil transition-colors hover:bg-yuzey-ikincil hover:text-metin',
          className,
        )}
      >
        <Bell className="size-5" aria-hidden />
        {sayi > 0 ? (
          <span
            data-testid="bildirim-rozeti"
            aria-hidden
            className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-vurgu px-1 text-[0.6875rem] font-semibold leading-none text-vurgu-uzeri"
          >
            {rozetMetni(sayi)}
          </span>
        ) : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          aria-label={t('bildirim.zil.sonBildirimler')}
          className="z-50 flex max-h-[min(32rem,80dvh)] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-buyuk border border-kenar bg-yuzey shadow-xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-kenar px-4 py-2.5">
            <h2 className="text-sm font-semibold">{t('bildirim.zil.sonBildirimler')}</h2>
            {sayi > 0 ? (
              <button
                type="button"
                onClick={() => {
                  tumunu.mutate(undefined);
                }}
                className="rounded-orta px-2 py-2 text-xs font-medium text-birincil hover:bg-yuzey-ikincil"
              >
                {t('bildirim.tumunuOku')}
              </button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {liste.isPending ? (
              <div
                role="status"
                aria-label={t('ortak.yukleniyor')}
                className="flex flex-col gap-2 p-4"
              >
                <Iskelet className="h-12 w-full" />
                <Iskelet className="h-12 w-full" />
                <Iskelet className="h-12 w-full" />
              </div>
            ) : liste.isError ? (
              <div role="alert" className="px-4 py-6 text-center text-sm text-metin-ikincil">
                <p>{t('bildirim.zil.yuklenemedi')}</p>
                <button
                  type="button"
                  onClick={() => {
                    void liste.refetch();
                  }}
                  className="mt-2 rounded-orta px-3 py-2 text-sm font-medium text-birincil hover:bg-yuzey-ikincil"
                >
                  {t('ortak.tekrarDene')}
                </button>
              </div>
            ) : liste.data.ogeler.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-metin-ikincil">
                {t('bildirim.zil.bos')}
              </p>
            ) : (
              <ul>
                {liste.data.ogeler.map((oge) => (
                  <BildirimSatiri
                    key={oge.id}
                    oge={oge}
                    kurumId={kurumId}
                    rol={rol}
                    tiklandi={(o) => {
                      if (o.okundu_at === null) okundu.mutate(o.id);
                      setAcik(false);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
          <Link
            href={bildirimlerYolu(kurumId)}
            onClick={() => {
              setAcik(false);
            }}
            className="border-t border-kenar px-4 py-3 text-center text-sm font-medium text-birincil hover:bg-yuzey-ikincil"
          >
            {t('bildirim.zil.tumunuGor')}
          </Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
