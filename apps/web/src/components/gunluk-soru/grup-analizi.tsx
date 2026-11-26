'use client';

import { t } from '@kopru/i18n';
import { ChartColumn } from 'lucide-react';
import { useState } from 'react';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { Alan } from '@/components/operasyon/ortak';
import { Iskelet, Kart } from '@/components/ui/kart';
import { Secim } from '@/components/ui/secim';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { siraliBransler } from '@/lib/bransler';
import { cn } from '@/lib/cn';
import {
  DONEMLER,
  SEVIYE_SINIFI,
  donemAdi,
  seviyeAdi,
  seviyeBul,
  yuzdeSayisi,
} from '@/lib/gunluk-soru/analiz';
import { useSinifAnalizi, type AnalizSorgusu } from '@/lib/gunluk-soru/veri';

/**
 * Grup/sinif gorunumu (grup detay sayfasi): konu bazinda grup basarisi ve en cok zorlanilan konular.
 * Bireysel ayrinti ogrenci kartindadir; burada ad ya da bireysel kayit yoktur, yalniz sayilar.
 */
export function GrupAnalizi({ grup }: { grup: { id: string } }) {
  const { uyelik } = useKurum();
  const [brans, setBrans] = useState('matematik');
  const [donem, setDonem] = useState<AnalizSorgusu['donem']>('30');
  const q = useSinifAnalizi(uyelik.kurumId, grup.id, { brans, donem });

  return (
    <Kart aria-labelledby="gs-grup-baslik" className="p-5" data-testid="grup-konu-analizi">
      <h2 id="gs-grup-baslik" className="text-base font-semibold">
        {t('gunlukSoru.grup.baslik')}
      </h2>
      <p className="mt-1 text-sm text-metin-ikincil">{t('gunlukSoru.grup.aciklama')}</p>
      <div className="mt-4 grid gap-3 sm:max-w-xl sm:grid-cols-2">
        <Alan etiket={t('gunlukSoru.analiz.ders')}>
          {(o) => (
            <Secim
              {...o}
              value={brans}
              onChange={(e) => {
                setBrans(e.target.value);
              }}
            >
              {siraliBransler().map((b) => (
                <option key={b.kod} value={b.kod}>
                  {b.ad}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
        <Alan etiket={t('gunlukSoru.analiz.donem')}>
          {(o) => (
            <Secim
              {...o}
              value={donem}
              onChange={(e) => {
                setDonem(e.target.value as AnalizSorgusu['donem']);
              }}
            >
              {DONEMLER.map((d) => (
                <option key={d} value={d}>
                  {donemAdi(d)}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
      </div>

      <div className="mt-4">
        {q.isPending ? (
          <div role="status" aria-label={t('ortak.yukleniyor')}>
            <Iskelet className="h-32 w-full" />
          </div>
        ) : q.isError ? (
          <HataDurumu
            baslik={t('gunlukSoru.grup.yuklenemedi')}
            aciklama={hataMesaji(q.error)}
            tekrarDene={() => void q.refetch()}
          />
        ) : q.data.konular.length === 0 ? (
          <BosDurum ikon={ChartColumn} baslik={t('gunlukSoru.grup.bos')} />
        ) : (
          <div className="flex flex-col gap-5">
            <section aria-labelledby="gs-grup-en-cok">
              <h3 id="gs-grup-en-cok" className="mb-2 text-sm font-semibold">
                {t('gunlukSoru.grup.enCok')}
              </h3>
              {q.data.en_cok_zorlanilan.length === 0 ? (
                <p className="text-sm text-metin-ikincil">{t('gunlukSoru.grup.enCokBos')}</p>
              ) : (
                <ol className="flex flex-col gap-1.5" data-testid="en-cok-zorlanilan">
                  {q.data.en_cok_zorlanilan.map((k) => (
                    <li
                      key={k.konu_id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-orta border border-kenar px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{k.konu_ad ?? ''}</span>
                      <span className="tabular-nums text-metin-ikincil">
                        %{yuzdeSayisi(k.toplam.basari)} ·{' '}
                        {t('gunlukSoru.grup.zorlananSayi', { n: k.zorlanan_ogrenci_sayisi })}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            {/* Dar ekranda yatay kayar: klavyeyle odaklanabilir olmali (axe scrollable-region-focusable). */}
            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label={t('gunlukSoru.grup.tablo')}
            >
              <table className="w-full min-w-[34rem] text-sm">
                <caption className="sr-only">{t('gunlukSoru.grup.tablo')}</caption>
                <thead>
                  <tr className="text-left text-metin-ikincil">
                    <th scope="col" className="py-1.5 pr-2 font-medium">
                      {t('gunlukSoru.grup.konu')}
                    </th>
                    <th scope="col" className="px-2 py-1.5 font-medium">
                      {t('gunlukSoru.grup.ogrenciSutunu')}
                    </th>
                    <th scope="col" className="px-2 py-1.5 font-medium">
                      {t('gunlukSoru.grup.zorlananSutunu')}
                    </th>
                    <th scope="col" className="px-2 py-1.5 font-medium">
                      {t('gunlukSoru.grup.cozulenSutunu')}
                    </th>
                    <th scope="col" className="py-1.5 pl-2 font-medium">
                      {t('gunlukSoru.grup.basariSutunu')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.konular.map((k) => {
                    const seviye = seviyeBul(k.toplam);
                    return (
                      <tr key={k.konu_id} className="border-t border-kenar">
                        <th scope="row" className="py-2 pr-2 text-left font-medium">
                          {k.konu_ad ?? ''}
                        </th>
                        <td className="px-2 py-2 tabular-nums">{k.ogrenci_sayisi}</td>
                        <td className="px-2 py-2 tabular-nums">{k.zorlanan_ogrenci_sayisi}</td>
                        <td className="px-2 py-2 tabular-nums">{k.toplam.cozulen}</td>
                        <td className="py-2 pl-2">
                          <span
                            className={cn(
                              'inline-flex min-w-24 flex-col items-center rounded-orta px-2 py-1',
                              SEVIYE_SINIFI[seviye],
                            )}
                          >
                            <span className="font-semibold tabular-nums">
                              {k.toplam.basari === null
                                ? '—'
                                : `%${String(yuzdeSayisi(k.toplam.basari))}`}
                            </span>
                            <span className="text-xs">{seviyeAdi(seviye)}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Kart>
  );
}
