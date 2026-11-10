'use client';

import { t } from '@kopru/i18n';

import { bransAdi } from '@/lib/bransler';
import { usePlanOzeti } from '@/lib/ogrenme/veri';

/** Ders bazinda planlanan / gerceklesen ozeti (soru ve dakika ayri toplanir, birbirine eklenmez). */
export function PlanOzeti({ kurumId, planId }: { kurumId: string; planId: string }) {
  const ozet = usePlanOzeti(kurumId, planId);
  if (ozet.isPending) {
    return (
      <p role="status" className="text-sm text-metin-ikincil">
        {t('ortak.yukleniyor')}
      </p>
    );
  }
  if (ozet.isError) {
    return (
      <p role="alert" className="text-sm text-hata">
        {t('ogrenme.plan.ozetYuklenemedi')}
      </p>
    );
  }
  const { dersler, toplam } = ozet.data;
  if (dersler.length === 0) {
    return <p className="text-sm text-metin-ikincil">{t('ogrenme.plan.ozetBos')}</p>;
  }
  const hucre = (m: { planlanan: number; gerceklesen: number }) =>
    m.planlanan === 0 && m.gerceklesen === 0
      ? '-'
      : `${String(m.gerceklesen)} / ${String(m.planlanan)}`;
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label={t('ogrenme.plan.ozetTablo')}
      className="overflow-x-auto"
    >
      <table className="w-full min-w-[28rem] text-left text-sm">
        <caption className="sr-only">{t('ogrenme.plan.ozetTablo')}</caption>
        <thead className="text-xs uppercase tracking-wide text-metin-ikincil">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">
              {t('ogrenme.odev.ders')}
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              {t('ogrenme.plan.ozetSoru')}
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              {t('ogrenme.plan.ozetDakika')}
            </th>
            <th scope="col" className="py-2 font-medium">
              {t('ogrenme.plan.ozetGorev')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-kenar">
          {dersler.map((d) => (
            <tr key={d.brans_kodu}>
              <th scope="row" className="py-2 pr-4 font-medium">
                {bransAdi(d.brans_kodu)}
              </th>
              <td className="py-2 pr-4">{hucre(d.soru)}</td>
              <td className="py-2 pr-4">{hucre(d.dakika)}</td>
              <td className="py-2">{`${String(d.tamam_sayisi)} / ${String(d.gorev_sayisi)}`}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-kenar font-semibold">
          <tr>
            <th scope="row" className="py-2 pr-4">
              {t('ogrenme.plan.ozetToplam')}
            </th>
            <td className="py-2 pr-4">{hucre(toplam.soru)}</td>
            <td className="py-2 pr-4">{hucre(toplam.dakika)}</td>
            <td className="py-2">{`${String(toplam.tamam_sayisi)} / ${String(toplam.gorev_sayisi)}`}</td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-2 text-xs text-metin-ikincil">{t('ogrenme.plan.ozetAciklama')}</p>
    </div>
  );
}
