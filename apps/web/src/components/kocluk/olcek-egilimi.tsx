import type { KoclukYaniti } from '@kopru/contracts';
import { t } from '@kopru/i18n';

import { kisaTarih } from '@/components/ogrenme/ortak';
import { OLCEKLER, olcekAdi, olcekYuzdesi, ortalamaYaz } from '@/lib/degerlendirme/model';

type Egilim = KoclukYaniti['olcek_ortalamalari'];

/**
 * Son 4 haftanın ölçek ortalamaları: erişilebilir tablo (satır = hafta, sütun = ölçek). Her hücrede değer
 * metin olarak vardır; çubuk yalnızca görsel destektir (`aria-hidden`).
 */
export function OlcekEgilimi({ egilim }: { egilim: Egilim }) {
  if (egilim.toplam.sayi === 0) {
    return (
      <p className="px-5 py-6 text-sm text-metin-ikincil" data-testid="egilim-bos">
        {t('kocluk.egilim.bos')}
      </p>
    );
  }
  return (
    <div
      className="overflow-x-auto"
      data-testid="olcek-egilimi"
      role="region"
      tabIndex={0}
      aria-label={t('kocluk.egilim.tabloAciklama')}
    >
      <table className="w-full min-w-[34rem] text-sm">
        <caption className="sr-only">{t('kocluk.egilim.tabloAciklama')}</caption>
        <thead>
          <tr className="border-b border-kenar text-left text-metin-ikincil">
            <th scope="col" className="px-5 py-2 font-medium">
              {t('kocluk.egilim.hafta')}
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              {t('kocluk.egilim.sayi')}
            </th>
            {OLCEKLER.map((o) => (
              <th key={o} scope="col" className="px-2 py-2 font-medium">
                {olcekAdi(o)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {egilim.haftalar.map((h) => (
            <tr key={h.hafta_baslangic} className="border-b border-kenar last:border-0">
              <th scope="row" className="px-5 py-2 text-left font-normal">
                {t('kocluk.egilim.haftaSatiri', { tarih: kisaTarih(h.hafta_baslangic) })}
              </th>
              <td className="px-2 py-2 text-right tabular-nums">{h.sayi}</td>
              {OLCEKLER.map((o) => (
                <Hucre key={o} deger={h[o]} />
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-kenar bg-yuzey-ikincil/40 font-medium">
            <th scope="row" className="px-5 py-2 text-left">
              {t('kocluk.egilim.ortalama')}
            </th>
            <td className="px-2 py-2 text-right tabular-nums">{egilim.toplam.sayi}</td>
            {OLCEKLER.map((o) => (
              <Hucre key={o} deger={egilim.toplam[o]} />
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Hucre({ deger }: { deger: number | null }) {
  return (
    <td className="px-2 py-2">
      <div className="flex items-center gap-2">
        <span className="w-8 tabular-nums">
          {deger === null ? (
            <>
              <span aria-hidden>–</span>
              <span className="sr-only">{t('kocluk.egilim.yok')}</span>
            </>
          ) : (
            ortalamaYaz(deger)
          )}
        </span>
        <span aria-hidden className="h-2 w-16 overflow-hidden rounded-full bg-yuzey-ikincil">
          <span
            className="block h-full rounded-full bg-birincil"
            style={{ width: `${String(olcekYuzdesi(deger))}%` }}
          />
        </span>
      </div>
    </td>
  );
}
