'use client';

import { t } from '@kopru/i18n';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Dugme } from '@/components/ui/button';
import { haftaBasi, haftaEtiketi, tarihEkle } from '@/lib/saat';

/** Hafta (Pazartesi-Pazar) gezgini: onceki / bu hafta / sonraki. */
export function HaftaGezgini({
  hafta,
  bugun,
  degisti,
}: {
  hafta: string;
  bugun: string;
  degisti: (hafta: string) => void;
}) {
  const buHafta = haftaBasi(bugun);
  return (
    <div
      role="group"
      aria-label={t('ogrenme.plan.haftaGezgini')}
      className="flex items-center gap-2"
    >
      <Dugme
        gorunum="ikincil"
        boyut="ikon"
        aria-label={t('ogrenme.plan.oncekiHafta')}
        onClick={() => {
          degisti(tarihEkle(hafta, -7));
        }}
      >
        <ChevronLeft aria-hidden />
      </Dugme>
      <p aria-live="polite" className="min-w-40 text-center text-sm font-semibold">
        {haftaEtiketi(hafta)}
      </p>
      <Dugme
        gorunum="ikincil"
        boyut="ikon"
        aria-label={t('ogrenme.plan.sonrakiHafta')}
        onClick={() => {
          degisti(tarihEkle(hafta, 7));
        }}
      >
        <ChevronRight aria-hidden />
      </Dugme>
      {hafta !== buHafta ? (
        <Dugme
          gorunum="hayalet"
          boyut="sm"
          onClick={() => {
            degisti(buHafta);
          }}
        >
          {t('ogrenme.plan.buHafta')}
        </Dugme>
      ) : null}
    </div>
  );
}
