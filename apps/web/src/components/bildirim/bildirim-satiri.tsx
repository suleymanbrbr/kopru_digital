'use client';

import type { BildirimKutuOgesi } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { Archive, Check } from 'lucide-react';
import Link from 'next/link';

import { KATEGORI_IKONU } from './kategori-ikon';

import { derinBaglantiyiCoz } from '@/lib/bildirim/derin-baglanti';
import { goreliZaman } from '@/lib/bildirim/zaman';
import { cn } from '@/lib/cn';
import type { Rol } from '@/lib/navigasyon';

export interface BildirimSatiriProps {
  oge: BildirimKutuOgesi;
  kurumId: string;
  rol: Rol;
  /** Satira (baglantiya) tiklaninca; okunmamissa okundu isaretleme burada yapilir. */
  tiklandi: (oge: BildirimKutuOgesi) => void;
  /** Verilirse okundu/arsivle dugmeleri gosterilir (sayfa gorunumu). */
  okunduIsaretle?: (id: string) => void;
  arsivle?: (id: string) => void;
}

/** Tek bildirim satiri: kategori simgesi, baslik, govde, goreli zaman; baglanti derin baglantiya gider. */
export function BildirimSatiri({
  oge,
  kurumId,
  rol,
  tiklandi,
  okunduIsaretle,
  arsivle,
}: BildirimSatiriProps) {
  const Ikon = KATEGORI_IKONU[oge.kategori];
  const okunmamis = oge.okundu_at === null;
  const hedef = derinBaglantiyiCoz(oge.derin_baglanti, { kurumId, rol });
  return (
    <li
      data-testid="bildirim-satiri"
      data-okunmamis={okunmamis ? 'true' : 'false'}
      className={cn(
        'group relative flex items-stretch gap-1 border-b border-kenar last:border-b-0',
        okunmamis ? 'bg-birincil-yumusak/40' : undefined,
      )}
    >
      <Link
        href={hedef}
        onClick={() => {
          tiklandi(oge);
        }}
        className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 hover:bg-yuzey-ikincil"
      >
        <span
          aria-hidden
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-yuzey-ikincil text-metin-ikincil"
        >
          <Ikon className="size-[1.125rem]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-sm',
                okunmamis ? 'font-semibold' : 'font-medium',
              )}
            >
              {oge.baslik}
            </span>
            {okunmamis ? (
              <>
                <span aria-hidden className="size-2 shrink-0 rounded-full bg-birincil" />
                <span className="sr-only">{t('bildirim.sayfa.okunmamisIsareti')}</span>
              </>
            ) : null}
          </span>
          <span className="mt-0.5 line-clamp-2 block text-sm text-metin-ikincil">{oge.govde}</span>
          <span className="mt-1 flex items-center gap-2 text-xs text-metin-ikincil">
            <span>{t(`bildirim.kategori.${oge.kategori}`)}</span>
            <span aria-hidden>·</span>
            <time dateTime={oge.created_at}>{goreliZaman(oge.created_at)}</time>
          </span>
        </span>
      </Link>
      {okunduIsaretle || arsivle ? (
        <div className="flex shrink-0 items-center gap-0.5 pr-2">
          {okunduIsaretle && okunmamis ? (
            <button
              type="button"
              title={t('bildirim.sayfa.okunduIsaretle')}
              aria-label={t('bildirim.sayfa.okunduIsaretleAd', { baslik: oge.baslik })}
              onClick={() => {
                okunduIsaretle(oge.id);
              }}
              className="flex size-11 items-center justify-center rounded-orta text-metin-ikincil hover:bg-yuzey-ikincil hover:text-metin"
            >
              <Check className="size-[1.125rem]" aria-hidden />
            </button>
          ) : null}
          {arsivle ? (
            <button
              type="button"
              title={t('bildirim.arsivle')}
              aria-label={t('bildirim.sayfa.arsivleAd', { baslik: oge.baslik })}
              onClick={() => {
                arsivle(oge.id);
              }}
              className="flex size-11 items-center justify-center rounded-orta text-metin-ikincil hover:bg-yuzey-ikincil hover:text-metin"
            >
              <Archive className="size-[1.125rem]" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
