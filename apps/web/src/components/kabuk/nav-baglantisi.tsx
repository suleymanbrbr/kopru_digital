'use client';

import { t } from '@kopru/i18n';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';
import type { NavOgesi } from '@/lib/navigasyon';
import { useBekleyenSayisi } from '@/lib/soru/veri';

export function useAktifMi(kurumId: string, yol: string): boolean {
  const yolAdi = usePathname();
  const hedef = `/${kurumId}/${yol}`;
  return yolAdi === hedef || yolAdi.startsWith(`${hedef}/`);
}

/** "Sorular" menusunde cevap bekleyen soru sayisi; sifirsa gorunmez. */
function BekleyenRozeti({ kurumId }: { kurumId: string }) {
  const q = useBekleyenSayisi(kurumId, true);
  const n = q.data?.bekleyen ?? 0;
  if (n === 0) return null;
  return (
    <span
      data-testid="menu-bekleyen-sayi"
      aria-label={t('soruSor.nav.bekleyen', { n })}
      className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-vurgu px-1.5 text-xs font-semibold text-vurgu-uzeri"
    >
      {n}
    </span>
  );
}

/** Yan menu / cekmece satiri. Etkin sayfa `aria-current="page"` ile isaretlenir. */
export function NavSatiri({
  oge,
  kurumId,
  tiklandi,
}: {
  oge: NavOgesi;
  kurumId: string;
  tiklandi?: () => void;
}) {
  const aktif = useAktifMi(kurumId, oge.yol);
  const Ikon = oge.ikon;
  return (
    <Link
      href={`/${kurumId}/${oge.yol}`}
      aria-current={aktif ? 'page' : undefined}
      onClick={tiklandi}
      className={cn(
        'relative flex h-11 items-center gap-3 rounded-orta px-3 text-[0.9375rem] font-medium text-metin-ikincil transition-colors hover:bg-yuzey-ikincil hover:text-metin lg:h-10',
        aktif && 'bg-birincil-yumusak text-birincil hover:bg-birincil-yumusak hover:text-birincil',
      )}
    >
      {aktif ? (
        <span
          aria-hidden
          className="absolute -left-3 top-2.5 bottom-2.5 w-1 rounded-full bg-vurgu"
        />
      ) : null}
      <Ikon className="size-[1.125rem] shrink-0" aria-hidden />
      {t(oge.baslik)}
      {oge.anahtar === 'sorular' ? <BekleyenRozeti kurumId={kurumId} /> : null}
    </Link>
  );
}

/** Alt menu hucresi (mobil). */
export function AltMenuHucresi({ oge, kurumId }: { oge: NavOgesi; kurumId: string }) {
  const aktif = useAktifMi(kurumId, oge.yol);
  const Ikon = oge.ikon;
  return (
    <Link
      href={`/${kurumId}/${oge.yol}`}
      aria-current={aktif ? 'page' : undefined}
      className={cn(
        'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-orta text-xs font-medium text-metin-ikincil',
        aktif && 'text-birincil',
      )}
    >
      <span
        className={cn(
          'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
          aktif && 'bg-birincil-yumusak',
        )}
      >
        <Ikon className="size-5" aria-hidden />
      </span>
      {t(oge.baslik)}
    </Link>
  );
}
