'use client';

import type { PlanLimitiDetay } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import Link from 'next/link';

import { dugmeStili, Dugme } from '@/components/ui/button';
import { Pencere } from '@/components/ui/pencere';
import { useKurum } from '@/kurum/baglam';

/** `402 plan_limiti`: hangi sinir, mevcut/ust sinir; sahibe abonelik baglantisi, digerlerine bildirim metni. */
export function PlanLimitiPenceresi({
  limit,
  degisti,
}: {
  limit: PlanLimitiDetay | null;
  degisti: () => void;
}) {
  const { rol, uyelik } = useKurum();
  const sahip = rol === 'sahip';
  const ogrenci = limit?.limit !== 'max_ogretmen';
  return (
    <Pencere
      acik={limit !== null}
      degisti={(acik) => {
        if (!acik) degisti();
      }}
      baslik={t('abonelik.limitPenceresi.baslik')}
    >
      {limit ? (
        <div className="flex flex-col gap-3 text-sm">
          <p className="font-medium" data-testid="limit-ozeti">
            {t(ogrenci ? 'abonelik.limitPenceresi.ogrenci' : 'abonelik.limitPenceresi.ogretmen', {
              mevcut: limit.mevcut,
              ust_sinir: limit.ust_sinir,
            })}
          </p>
          <p className="text-metin-ikincil">{t('abonelik.limitPenceresi.veri')}</p>
          <p>{t(sahip ? 'abonelik.limitPenceresi.sahip' : 'abonelik.limitPenceresi.diger')}</p>
          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dugme gorunum="ikincil" onClick={degisti}>
              {t('abonelik.limitPenceresi.kapat')}
            </Dugme>
            {sahip ? (
              <Link href={`/${uyelik.kurumId}/abonelik`} onClick={degisti} className={dugmeStili()}>
                {t('abonelik.planiYukselt')}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </Pencere>
  );
}
