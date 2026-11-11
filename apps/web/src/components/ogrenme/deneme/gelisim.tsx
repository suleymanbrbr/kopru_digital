'use client';

import type { DenemeKuraliTipi } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';

import { CizgiGrafigi, type GrafikSerisi } from './cizgi-grafigi';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { ListeIskeleti } from '@/components/hesap/ortak';
import { Alan } from '@/components/operasyon/ortak';
import { Secim } from '@/components/ui/secim';
import { hataMesaji } from '@/lib/api';
import { bransAdi } from '@/lib/bransler';
import { netMetni } from '@/lib/ogrenme/net';
import { useGelisim, useGrupOzeti } from '@/lib/ogrenme/veri';
import { gunEtiketi } from '@/lib/saat';

const SAYI = (n: number | null) => (n === null ? '-' : netMetni(n));

/** Degisim metni: isaret metinle verilir (renk tek basina anlam tasimaz). */
function degisimMetni(d: number | null): string {
  if (d === null) return '-';
  if (d === 0) return netMetni(0);
  return `${d > 0 ? '+' : '-'}${netMetni(Math.abs(d))}`;
}

/** Ogrencinin deneme gelisimi: toplam ve secilen bolum trend cizgisi, son 5 ortalamasi ve degisim. */
export function GelisimPaneli({
  kurumId,
  ogrenciId,
  kural,
}: {
  kurumId: string;
  ogrenciId: string;
  kural: DenemeKuraliTipi | undefined;
}) {
  const g = useGelisim(kurumId, ogrenciId, kural?.kod ?? '');
  const [bolum, setBolum] = useState('');
  const bolumAdi = (kod: string, brans: string) =>
    kural?.bolumler.find((b) => b.bolum_kodu === kod)?.ad ?? bransAdi(brans);

  const veri = g.data;
  const seriler = useMemo<GrafikSerisi[]>(() => {
    if (!veri) return [];
    const liste: GrafikSerisi[] = [
      {
        ad: t('ogrenme.deneme.toplamNet'),
        renk: 'var(--birincil)',
        degerler: veri.noktalar.map((n) => n.toplam_net),
      },
    ];
    if (bolum) {
      const ilk = veri.noktalar.flatMap((n) => n.bolumler).find((b) => b.bolum_kodu === bolum);
      liste.push({
        ad: bolumAdi(bolum, ilk?.brans_kodu ?? ''),
        renk: 'var(--vurgu)',
        kesik: '6 4',
        degerler: veri.noktalar.map(
          (n) => n.bolumler.find((b) => b.bolum_kodu === bolum)?.net ?? null,
        ),
      });
    }
    return liste;
    // `bolumAdi` kural degisince yeniden olusur; veri ve bolum yeterli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veri, bolum, kural]);

  if (!kural) return null;
  if (g.isPending) return <ListeIskeleti satir={3} />;
  if (g.isError) {
    return (
      <HataDurumu
        baslik={t('ogrenme.deneme.gelisimYuklenemedi')}
        aciklama={hataMesaji(g.error)}
        tekrarDene={() => void g.refetch()}
      />
    );
  }
  if (!veri || veri.deneme_sayisi === 0) {
    return (
      <BosDurum
        className="py-12"
        ikon={TrendingUp}
        baslik={t('ogrenme.deneme.gelisimBos')}
        aciklama={t('ogrenme.deneme.gelisimBosAciklama')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Istatistik etiket={t('ogrenme.deneme.denemeSayisi')} deger={String(veri.deneme_sayisi)} />
        <Istatistik etiket={t('ogrenme.deneme.son5')} deger={SAYI(veri.son5_ortalama)} />
        <Istatistik etiket={t('ogrenme.deneme.onceki5')} deger={SAYI(veri.onceki5_ortalama)} />
        <Istatistik etiket={t('ogrenme.deneme.degisim')} deger={degisimMetni(veri.degisim)} />
      </dl>
      <div className="max-w-xs">
        <Alan etiket={t('ogrenme.deneme.bolumCizgisi')}>
          {(o) => (
            <Secim
              {...o}
              value={bolum}
              onChange={(e) => {
                setBolum(e.target.value);
              }}
            >
              <option value="">{t('ogrenme.deneme.bolumYok')}</option>
              {kural.bolumler.map((b) => (
                <option key={b.bolum_kodu} value={b.bolum_kodu}>
                  {b.ad}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
      </div>
      <CizgiGrafigi
        baslik={t('ogrenme.deneme.grafikBaslik', { kural: kural.ad })}
        etiketler={veri.noktalar.map((n) => n.ad)}
        seriler={seriler}
      />
      {veri.bolum_gelisimi.length > 0 ? (
        <div
          tabIndex={0}
          role="region"
          aria-label={t('ogrenme.deneme.bolumGelisimTablo')}
          className="overflow-x-auto rounded-buyuk border border-kenar"
        >
          <table className="w-full min-w-[28rem] text-left text-sm">
            <caption className="sr-only">{t('ogrenme.deneme.bolumGelisimTablo')}</caption>
            <thead className="border-b border-kenar text-xs uppercase tracking-wide text-metin-ikincil">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t('ogrenme.deneme.bolum')}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t('ogrenme.deneme.son5')}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t('ogrenme.deneme.onceki5')}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {t('ogrenme.deneme.degisim')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-kenar">
              {veri.bolum_gelisimi.map((b) => (
                <tr key={b.bolum_kodu}>
                  <th scope="row" className="px-4 py-2 font-medium">
                    {bolumAdi(b.bolum_kodu, b.brans_kodu)}
                  </th>
                  <td className="px-4 py-2">{SAYI(b.son5_ortalama)}</td>
                  <td className="px-4 py-2">{SAYI(b.onceki5_ortalama)}</td>
                  <td className="px-4 py-2">{degisimMetni(b.degisim)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="text-xs text-metin-ikincil">
        {t('ogrenme.deneme.sonDeneme', {
          ad: veri.noktalar[veri.noktalar.length - 1]?.ad ?? '',
          tarih: gunEtiketi(
            veri.noktalar[veri.noktalar.length - 1]?.sinav_tarihi ??
              veri.noktalar[0]?.sinav_tarihi ??
              '',
          ),
        })}
      </p>
    </div>
  );
}

function Istatistik({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="rounded-buyuk border border-kenar bg-yuzey px-4 py-3">
      <dt className="text-xs text-metin-ikincil">{etiket}</dt>
      <dd className="mt-0.5 text-xl font-semibold">{deger}</dd>
    </div>
  );
}

/** Sinif ortalamasi (yalniz ogretmen/yonetici): grup + kural icin ortalama, bolum ortalamalari, ogrenci satirlari. */
export function SinifOzeti({
  kurumId,
  grupId,
  kural,
}: {
  kurumId: string;
  grupId: string;
  kural: DenemeKuraliTipi | undefined;
}) {
  const ozet = useGrupOzeti(kurumId, grupId, kural?.kod ?? '', true);
  if (grupId === '' || !kural) return null;
  if (ozet.isPending) return <ListeIskeleti satir={3} />;
  if (ozet.isError) {
    return (
      <HataDurumu
        baslik={t('ogrenme.deneme.ozetYuklenemedi')}
        aciklama={hataMesaji(ozet.error)}
        tekrarDene={() => void ozet.refetch()}
      />
    );
  }
  const o = ozet.data;
  return (
    <section aria-label={t('ogrenme.deneme.sinifOrtalamasi')} className="flex flex-col gap-4">
      <dl className="grid grid-cols-3 gap-3">
        <Istatistik etiket={t('ogrenme.deneme.sinifOrtalamasi')} deger={SAYI(o.sinif_ortalamasi)} />
        <Istatistik etiket={t('ogrenme.deneme.ogrenciSayisi')} deger={String(o.ogrenci_sayisi)} />
        <Istatistik
          etiket={t('ogrenme.deneme.denemesiOlan')}
          deger={String(o.denemesi_olan_sayisi)}
        />
      </dl>
      <div
        tabIndex={0}
        role="region"
        aria-label={t('ogrenme.deneme.sinifTablo')}
        className="overflow-x-auto rounded-buyuk border border-kenar bg-yuzey"
      >
        <table className="w-full min-w-[28rem] text-left text-sm">
          <caption className="sr-only">{t('ogrenme.deneme.sinifTablo')}</caption>
          <thead className="border-b border-kenar text-xs uppercase tracking-wide text-metin-ikincil">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">
                {t('ogrenme.ortak.ogrenci')}
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                {t('ogrenme.deneme.denemeSayisi')}
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                {t('ogrenme.deneme.sonNet')}
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                {t('ogrenme.deneme.son5')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-kenar">
            {o.ogrenciler.map((s) => (
              <tr key={s.ogrenci_id}>
                <th scope="row" className="px-4 py-2 font-medium">
                  {s.gorunen_ad ?? '-'}
                </th>
                <td className="px-4 py-2">{s.deneme_sayisi}</td>
                <td className="px-4 py-2">{SAYI(s.son_net)}</td>
                <td className="px-4 py-2">{SAYI(s.son5_ortalama)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {o.bolum_ortalamalari.length > 0 ? (
        <ul
          className="flex flex-wrap gap-2 text-sm"
          aria-label={t('ogrenme.deneme.bolumOrtalamalari')}
        >
          {o.bolum_ortalamalari.map((b) => (
            <li key={b.bolum_kodu} className="rounded-full bg-yuzey-ikincil px-3 py-1">
              {kural.bolumler.find((x) => x.bolum_kodu === b.bolum_kodu)?.ad ??
                bransAdi(b.brans_kodu)}
              : {netMetni(b.ortalama)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
