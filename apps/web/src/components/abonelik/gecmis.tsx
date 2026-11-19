'use client';

import type { FaturaGecmisiYanitSema, OdemeGecmisiYanitSema } from '@kopru/contracts';
import { kurusBicimle, t } from '@kopru/i18n';
import type { z } from 'zod';

import { tarihYaz } from '@/components/hesap/ortak';
import { Kart } from '@/components/ui/kart';
import { Rozet } from '@/components/ui/rozet';

type Odemeler = z.output<typeof OdemeGecmisiYanitSema>['odemeler'];
type Faturalar = z.output<typeof FaturaGecmisiYanitSema>['faturalar'];

const odemeTonu = { basarili: 'basari', basarisiz: 'hata', iade: 'uyari' } as const;
const faturaTonu = { bekliyor: 'uyari', kesildi: 'basari', hata: 'hata', iptal: 'notr' } as const;

function Bos({ metin }: { metin: string }) {
  return <p className="px-5 py-6 text-sm text-metin-ikincil">{metin}</p>;
}

export function OdemeGecmisi({ odemeler }: { odemeler: Odemeler }) {
  return (
    <Kart aria-labelledby="abonelik-odemeler" className="overflow-hidden">
      <h2 id="abonelik-odemeler" className="border-b border-kenar px-5 py-3 text-lg font-semibold">
        {t('abonelik.gecmis.odemeBaslik')}
      </h2>
      {odemeler.length === 0 ? (
        <Bos metin={t('abonelik.gecmis.odemeYok')} />
      ) : (
        <ul className="divide-y divide-kenar" data-testid="odeme-gecmisi">
          {odemeler.map((o) => (
            <li
              key={o.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm"
            >
              <div>
                <p className="font-medium">{tarihYaz(o.odeme_at)}</p>
                <p className="text-metin-ikincil">
                  {t('abonelik.gecmis.donem')}: {tarihYaz(o.donem_baslangic_at)} –{' '}
                  {tarihYaz(o.donem_bitis_at)} · {t(`abonelik.kaynak.${o.kaynak}`)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium">
                  {o.durum === 'iade' ? '−' : ''}
                  {kurusBicimle(o.tutar_kurus)}
                </span>
                <Rozet ton={odemeTonu[o.durum]}>{t(`abonelik.gecmis.odemeDurum.${o.durum}`)}</Rozet>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Kart>
  );
}

export function FaturaGecmisi({ faturalar }: { faturalar: Faturalar }) {
  return (
    <Kart aria-labelledby="abonelik-faturalar" className="overflow-hidden">
      <h2 id="abonelik-faturalar" className="border-b border-kenar px-5 py-3 text-lg font-semibold">
        {t('abonelik.gecmis.faturaBaslik')}
      </h2>
      {faturalar.length === 0 ? (
        <Bos metin={t('abonelik.gecmis.faturaYok')} />
      ) : (
        <ul className="divide-y divide-kenar" data-testid="fatura-gecmisi">
          {faturalar.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm"
            >
              <div>
                <p className="font-medium">{t(`abonelik.gecmis.faturaTur.${f.tur}`)}</p>
                <p className="text-metin-ikincil">
                  {f.fatura_no ? `${t('abonelik.gecmis.faturaNo')}: ${f.fatura_no}` : '—'}
                  {f.kesim_at ? ` · ${tarihYaz(f.kesim_at)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium">
                  {kurusBicimle(f.toplam_kurus)}{' '}
                  <span className="text-xs font-normal text-metin-ikincil">
                    ({t('abonelik.gecmis.kdv')})
                  </span>
                </span>
                <Rozet ton={faturaTonu[f.durum]}>
                  {t(`abonelik.gecmis.faturaDurum.${f.durum}`)}
                </Rozet>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Kart>
  );
}
