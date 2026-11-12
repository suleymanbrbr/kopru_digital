'use client';

import type { SoruOlcumSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useState } from 'react';
import type { z } from 'zod';

import { HataDurumu } from '@/components/hata-durumu';
import { ListeIskeleti } from '@/components/hesap/ortak';
import { Alan } from '@/components/operasyon/ortak';
import { Girdi } from '@/components/ui/input';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { bransAdi } from '@/lib/bransler';
import { sureKisa, yuzdeMetni } from '@/lib/soru/soru';
import { useSoruOlcumu } from '@/lib/soru/veri';

type Olcum = z.output<typeof SoruOlcumSema>;
type Satir = Pick<
  Olcum,
  'soru_sayisi' | 'cevaplanan' | 'anladim' | 'anladim_orani' | 'ortalama_ilk_cevap_sn'
>;

const yok = '—';

/** Kullanici bir tarih girmediyse sunucunun varsayilan aralik degerini gosterir. */
const varsayilanli = (girilen: string, sunucu: string | undefined): string =>
  girilen === '' ? (sunucu ?? '') : girilen;

/** Olcum: ortalama ilk cevap suresi ve "anladim" orani; ogretmen ve brans kirilimi, tarih araligi. */
export function YonetimOlcum() {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const [aralik, setAralik] = useState({ baslangic: '', bitis: '' });
  const q = useSoruOlcumu(kurumId, aralik);
  const o = q.data;
  const gecersiz =
    aralik.baslangic !== '' && aralik.bitis !== '' && aralik.baslangic > aralik.bitis;

  return (
    <section
      aria-label={t('soruSor.olcum.baslik')}
      className="rounded-buyuk border border-kenar bg-yuzey"
    >
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-kenar px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">{t('soruSor.olcum.baslik')}</h2>
          <p className="mt-0.5 text-sm text-metin-ikincil">{t('soruSor.olcum.aciklama')}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Alan etiket={t('soruSor.olcum.baslangic')}>
            {(a) => (
              <Girdi
                {...a}
                type="date"
                value={varsayilanli(aralik.baslangic, o?.baslangic)}
                onChange={(e) => {
                  setAralik({ ...aralik, baslangic: e.target.value });
                }}
              />
            )}
          </Alan>
          <Alan
            etiket={t('soruSor.olcum.bitis')}
            hata={gecersiz ? t('soruSor.olcum.aralikHata') : undefined}
          >
            {(a) => (
              <Girdi
                {...a}
                type="date"
                value={varsayilanli(aralik.bitis, o?.bitis)}
                onChange={(e) => {
                  setAralik({ ...aralik, bitis: e.target.value });
                }}
              />
            )}
          </Alan>
        </div>
      </header>

      {q.isPending ? (
        <ListeIskeleti satir={3} />
      ) : q.isError ? (
        <HataDurumu aciklama={hataMesaji(q.error)} tekrarDene={() => void q.refetch()} />
      ) : o ? (
        <div className="flex flex-col gap-6 p-4">
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="olcum-ozeti">
            <Ozet etiket={t('soruSor.olcum.soru')} deger={String(o.soru_sayisi)} />
            <Ozet etiket={t('soruSor.olcum.cevaplanan')} deger={String(o.cevaplanan)} />
            <Ozet
              etiket={t('soruSor.olcum.ilkCevap')}
              deger={sureKisa(o.ortalama_ilk_cevap_sn) ?? yok}
            />
            <Ozet etiket={t('soruSor.olcum.anladim')} deger={yuzdeMetni(o.anladim_orani) ?? yok} />
          </dl>
          <Tablo
            baslik={t('soruSor.olcum.ogretmenler')}
            ilkSutun={t('soruSor.olcum.ogretmen')}
            satirlar={o.ogretmenler.map((x) => ({
              anahtar: x.ogretmen_id,
              ad: x.gorunen_ad ?? t('soruSor.masa.adsiz'),
              satir: x,
            }))}
          />
          <Tablo
            baslik={t('soruSor.olcum.branslar')}
            ilkSutun={t('soruSor.olcum.brans')}
            satirlar={o.branslar.map((x) => ({
              anahtar: x.brans_kodu,
              ad: bransAdi(x.brans_kodu),
              satir: x,
            }))}
          />
        </div>
      ) : null}
    </section>
  );
}

function Ozet({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="rounded-orta border border-kenar p-3">
      <dt className="text-sm text-metin-ikincil">{etiket}</dt>
      <dd className="mt-1 text-2xl font-semibold">{deger}</dd>
    </div>
  );
}

function Tablo({
  baslik,
  ilkSutun,
  satirlar,
}: {
  baslik: string;
  ilkSutun: string;
  satirlar: { anahtar: string; ad: string; satir: Satir }[];
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{baslik}</h3>
      {satirlar.length === 0 ? (
        <p className="text-sm text-metin-ikincil">{t('soruSor.olcum.veriYok')}</p>
      ) : (
        <div className="overflow-x-auto" role="region" aria-label={baslik} tabIndex={0}>
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="sr-only">{baslik}</caption>
            <thead>
              <tr className="border-b border-kenar text-metin-ikincil">
                <th scope="col" className="py-2 pr-3 font-medium">
                  {ilkSutun}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  {t('soruSor.olcum.soru')}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  {t('soruSor.olcum.cevaplanan')}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  {t('soruSor.olcum.ilkCevap')}
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  {t('soruSor.olcum.anladim')}
                </th>
              </tr>
            </thead>
            <tbody>
              {satirlar.map(({ anahtar, ad, satir }) => (
                <tr key={anahtar} className="border-b border-kenar last:border-0">
                  <th scope="row" className="py-2 pr-3 font-medium">
                    {ad}
                  </th>
                  <td className="py-2 pr-3 text-right">{satir.soru_sayisi}</td>
                  <td className="py-2 pr-3 text-right">{satir.cevaplanan}</td>
                  <td className="py-2 pr-3 text-right">
                    {sureKisa(satir.ortalama_ilk_cevap_sn) ?? yok}
                  </td>
                  <td className="py-2 text-right">{yuzdeMetni(satir.anladim_orani) ?? yok}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
