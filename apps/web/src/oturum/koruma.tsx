'use client';

import { t } from '@kopru/i18n';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { useOturum } from './saglayici';
import type { Oturum } from './tipler';

export function EkranYukleniyor() {
  return (
    <div
      role="status"
      className="flex min-h-dvh items-center justify-center text-sm text-metin-ikincil"
    >
      <span
        className="mr-3 size-4 animate-spin rounded-full border-2 border-kenar border-t-birincil"
        aria-hidden
      />
      {t('oturum.oturumKontrol')}
    </div>
  );
}

type Hedef = 'giris' | 'kvkk' | 'kurum-sec';

/** Oturum durumuna gore bu ekranda kalinabilir mi? Degilse gidilecek yer. */
export function yonlendirmeHedefi(
  ekran: 'giris' | 'kvkk' | 'uygulama',
  durum: ReturnType<typeof useOturum>['durum'],
): Hedef | null {
  if (durum.tur === 'yukleniyor') return null;
  if (durum.tur === 'girissiz') return ekran === 'giris' ? null : 'giris';
  const { rizaGerekli } = durum.oturum;
  if (rizaGerekli) return ekran === 'kvkk' ? null : 'kvkk';
  return ekran === 'uygulama' ? null : 'kurum-sec';
}

/**
 * Ekran korumasi. `render` yalnizca oturum durumu bu ekrana uygunsa cizilir; aksi halde
 * yonlendirme sirasinda yukleniyor gosterilir (iceriksiz yanip sonme olmaz).
 */
export function Koruma({
  ekran,
  children,
}: {
  ekran: 'giris' | 'kvkk' | 'uygulama';
  children: (oturum: Oturum | null) => ReactNode;
}) {
  const { durum } = useOturum();
  const router = useRouter();
  const hedef = yonlendirmeHedefi(ekran, durum);

  useEffect(() => {
    if (hedef) router.replace(`/${hedef}`);
  }, [hedef, router]);

  if ((durum.tur === 'yukleniyor' && ekran !== 'giris') || hedef) return <EkranYukleniyor />;
  return <>{children(durum.tur === 'hazir' ? durum.oturum : null)}</>;
}
