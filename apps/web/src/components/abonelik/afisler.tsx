'use client';

import { t } from '@kopru/i18n';
import { Clock, Lock } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { dugmeStili } from '@/components/ui/button';
import { useKurumAbonelik } from '@/kurum/abonelik-durumu';
import { useKurum } from '@/kurum/baglam';
import { denemeAfisiGun } from '@/lib/abonelik/bicim';
import { useSimdi } from '@/lib/simdi';

function Afis({
  ikon,
  etiket,
  children,
  eylem,
}: {
  ikon: ReactNode;
  etiket: string;
  children: ReactNode;
  eylem?: ReactNode;
}) {
  return (
    <section
      aria-label={etiket}
      className="mb-4 flex flex-wrap items-center gap-3 rounded-orta border border-kenar bg-uyari-yumusak px-4 py-3 text-sm text-metin"
    >
      <span aria-hidden className="shrink-0">
        {ikon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
      {eylem}
    </section>
  );
}

/**
 * Kurum geneli abonelik afisleri: salt-okunur (abonelik etkin degil) ve sahibe "deneme bitiyor" (<= 3 gun).
 * Yazma gerektiren yerlerde 402 yine duzgun gosterilir; bu afis yalniz bilgilendirir.
 */
export function AbonelikAfisleri() {
  const { rol, uyelik } = useKurum();
  const { saltOkunur, abonelik } = useKurumAbonelik();
  const sahip = rol === 'sahip';
  const abonelikYolu = `/${uyelik.kurumId}/abonelik`;
  const simdi = useSimdi();
  const deneme = sahip ? denemeAfisiGun(abonelik?.abonelik ?? null, simdi) : null;

  return (
    <>
      {saltOkunur ? (
        <Afis
          ikon={<Lock className="size-5" />}
          etiket={t('abonelik.durum.askida')}
          eylem={
            sahip ? (
              <Link href={abonelikYolu} className={dugmeStili({ boyut: 'sm' })}>
                {t('abonelik.afis.aboneligeGit')}
              </Link>
            ) : null
          }
        >
          <p className="font-medium">{t('abonelik.afis.saltOkunur')}</p>
          <p className="text-metin-ikincil">
            {t(sahip ? 'abonelik.afis.saltOkunurSahip' : 'abonelik.afis.saltOkunurDiger')}
          </p>
        </Afis>
      ) : null}
      {deneme !== null ? (
        <Afis
          ikon={<Clock className="size-5" />}
          etiket={t('abonelik.durum.deneme')}
          eylem={
            <Link href={abonelikYolu} className={dugmeStili({ boyut: 'sm' })}>
              {t('abonelik.afis.aboneOl')}
            </Link>
          }
        >
          <p className="font-medium">{t('abonelik.afis.denemeBitiyor', { gun: deneme })}</p>
        </Afis>
      ) : null}
    </>
  );
}
