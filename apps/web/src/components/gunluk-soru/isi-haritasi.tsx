'use client';

import type { AnalizZorlugu, Hucre, KonuAnaliziSema, Oneri } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { UserRound } from 'lucide-react';
import type { z } from 'zod';

import { Rozet } from '@/components/ui/rozet';
import { cn } from '@/lib/cn';
import {
  SEVIYE_SINIFI,
  belirtilmemisVar,
  bantMetni,
  birebirVarMi,
  seviyeAdi,
  seviyeBul,
  yuzdeSayisi,
  zorlukAdi,
} from '@/lib/gunluk-soru/analiz';

type KonuAnalizi = z.infer<typeof KonuAnaliziSema>;

export interface HucreSecimi {
  konuId: string;
  konuAd: string;
  zorluk: AnalizZorlugu | undefined;
}

const SUTUNLAR = ['kolay', 'orta', 'zor'] as const;

/**
 * Konu x zorluk isi haritasi. Renk tek basina anlam tasimaz: her hucrede yuzde, `dogru/cozulen` ve seviye
 * metni (iyi / orta / zayif / veri az) vardir. Hucre dugmedir; dokununca kayitlar ve fotograflar acilir.
 */
export function IsiHaritasi({
  konular,
  oneriler,
  sec,
}: {
  konular: readonly KonuAnalizi[];
  oneriler?: readonly Oneri[] | undefined;
  sec: (s: HucreSecimi) => void;
}) {
  const sutunlar: readonly AnalizZorlugu[] = belirtilmemisVar(konular)
    ? [...SUTUNLAR, 'belirtilmemis']
    : SUTUNLAR;
  return (
    <div className="overflow-x-auto" data-testid="isi-haritasi">
      <table className="w-full min-w-[40rem] border-separate border-spacing-1 text-sm">
        <caption className="sr-only">{t('gunlukSoru.analiz.tablo')}</caption>
        <thead>
          <tr>
            <th scope="col" className="px-2 py-1 text-left font-medium text-metin-ikincil">
              {t('gunlukSoru.analiz.konuSutunu')}
            </th>
            {sutunlar.map((z) => (
              <th
                key={z}
                scope="col"
                className="px-2 py-1 text-center font-medium text-metin-ikincil"
              >
                {zorlukAdi(z)}
              </th>
            ))}
            <th scope="col" className="px-2 py-1 text-center font-medium text-metin-ikincil">
              {t('gunlukSoru.analiz.toplamSutunu')}
            </th>
            <th scope="col" className="px-2 py-1 text-left font-medium text-metin-ikincil">
              {t('gunlukSoru.analiz.durumSutunu')}
            </th>
          </tr>
        </thead>
        <tbody>
          {konular.map((k) => {
            const ad = k.konu_ad ?? '';
            const bant = bantMetni(k);
            return (
              <tr key={k.konu_id} data-testid="isi-satiri">
                <th scope="row" className="px-2 py-1 text-left font-medium align-middle">
                  <span className="block">{ad}</span>
                  {k.ust_konu_ad ? (
                    <span className="block text-xs font-normal text-metin-ikincil">
                      {k.ust_konu_ad}
                    </span>
                  ) : null}
                </th>
                {sutunlar.map((z) => (
                  <td key={z} className="p-0 align-middle">
                    <HucreDugmesi
                      konu={ad}
                      zorluk={z}
                      hucre={k.hucreler[z]}
                      sec={() => {
                        sec({ konuId: k.konu_id, konuAd: ad, zorluk: z });
                      }}
                    />
                  </td>
                ))}
                <td className="p-0 align-middle">
                  <HucreDugmesi
                    konu={ad}
                    zorluk={undefined}
                    hucre={k.toplam}
                    sec={() => {
                      sec({ konuId: k.konu_id, konuAd: ad, zorluk: undefined });
                    }}
                  />
                </td>
                <td className="px-2 py-1 align-middle">
                  <div className="flex flex-col items-start gap-1">
                    <span
                      className={cn(
                        'text-sm',
                        bant.ton === 'hata' && 'font-semibold text-hata',
                        bant.ton === 'notr' && 'text-metin-ikincil',
                      )}
                    >
                      {bant.metin}
                    </span>
                    {birebirVarMi(oneriler, k.konu_id) ? (
                      <Rozet ton="uyari" className="gap-1">
                        <UserRound className="size-3" aria-hidden />
                        {t('gunlukSoru.analiz.birebir')}
                      </Rozet>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-metin-ikincil">{t('gunlukSoru.analiz.renkAciklamasi')}</p>
    </div>
  );
}

function HucreDugmesi({
  konu,
  zorluk,
  hucre,
  sec,
}: {
  konu: string;
  zorluk: AnalizZorlugu | undefined;
  hucre: Hucre;
  sec: () => void;
}) {
  const seviye = seviyeBul(hucre);
  const zorlukMetni = zorluk ? zorlukAdi(zorluk) : t('gunlukSoru.analiz.toplamSutunu');
  if (seviye === 'bos') {
    return (
      <div className="flex min-h-14 items-center justify-center rounded-orta text-metin-ikincil">
        <span aria-hidden>—</span>
        <span className="sr-only">
          {t('gunlukSoru.analiz.hucreEtiketBos', { konu, zorluk: zorlukMetni })}
        </span>
      </div>
    );
  }
  const yuzde = yuzdeSayisi(hucre.basari);
  return (
    <button
      type="button"
      onClick={sec}
      data-seviye={seviye}
      aria-label={t('gunlukSoru.analiz.hucreEtiket', {
        konu,
        zorluk: zorlukMetni,
        cozulen: hucre.cozulen,
        dogru: hucre.dogru,
        yuzde,
        seviye: seviyeAdi(seviye),
      })}
      className={cn(
        'flex min-h-14 w-full flex-col items-center justify-center rounded-orta px-2 py-1 text-center ring-offset-2 hover:ring-2 hover:ring-birincil',
        SEVIYE_SINIFI[seviye],
      )}
    >
      <span className="text-base font-semibold tabular-nums">
        {hucre.basari === null ? '—' : `%${String(yuzde)}`}
      </span>
      <span className="text-xs tabular-nums">
        {t('gunlukSoru.analiz.hucreAyrinti', { dogru: hucre.dogru, cozulen: hucre.cozulen })}
      </span>
      <span className="text-xs font-medium">{seviyeAdi(seviye)}</span>
    </button>
  );
}
