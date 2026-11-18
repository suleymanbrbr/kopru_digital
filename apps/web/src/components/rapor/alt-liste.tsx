'use client';

import type { RaporDonemi } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { ListChecks, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { ListeIskeleti, tarihYaz } from '@/components/hesap/ortak';
import { Dugme } from '@/components/ui/button';
import { Kart } from '@/components/ui/kart';
import { Rozet } from '@/components/ui/rozet';
import { hataMesaji } from '@/lib/api';
import { bransAdi } from '@/lib/bransler';
import { sureYaz, yuzdeYaz } from '@/lib/rapor/model';
import { useRaporListe, type Gosterge, type ListeSuzgeci } from '@/lib/rapor/veri';

/** Panelde tiklanan sayinin kapsami: hangi gosterge, hangi grup/ogretmen. */
export interface AltListeSecimi extends ListeSuzgeci {
  gosterge: Gosterge;
  /** Baslikta gosterilen kapsam adi (kurum / grup adi / ogretmen adi). */
  kapsamAdi: string;
}

interface Sutun {
  baslik: string;
  sagda?: boolean;
}

const th = 'px-3 py-2 font-medium';

/**
 * Sayinin altindaki liste: ogrenci bazinda satirlar; her ogrenci mevcut ogrenci sayfasina gider.
 * Panelin altinda acilir (sayfa kaymaz), kapatilinca odak tetikleyen sayiya doner (ust bilesen yonetir).
 */
export function AltListe({
  kurumId,
  donem,
  secim,
  kapat,
}: {
  kurumId: string;
  donem: RaporDonemi;
  secim: AltListeSecimi;
  kapat: () => void;
}) {
  const kok = useRef<HTMLElement>(null);
  useEffect(() => {
    // Liste acilinca gorunur olsun (jsdom'da yok).
    kok.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [secim.gosterge, secim.grupId, secim.ogretmenId]);

  const baslik = t('rapor.altListe.baslik', {
    gosterge: t(`rapor.gosterge.${secim.gosterge}`),
    kapsam: secim.kapsamAdi,
  });
  return (
    <Kart
      ref={kok}
      aria-labelledby="alt-liste-baslik"
      data-testid="alt-liste"
      className="mt-6 scroll-mt-20 overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 border-b border-kenar px-4 py-3">
        <h2 id="alt-liste-baslik" className="text-base font-semibold">
          {baslik}
        </h2>
        <Dugme gorunum="hayalet" boyut="sm" onClick={kapat} aria-label={t('rapor.altListe.kapat')}>
          <X aria-hidden />
          {t('ortak.kapat')}
        </Dugme>
      </div>
      <ListeGovdesi kurumId={kurumId} donem={donem} secim={secim} />
    </Kart>
  );
}

function ListeGovdesi({
  kurumId,
  donem,
  secim,
}: {
  kurumId: string;
  donem: RaporDonemi;
  secim: AltListeSecimi;
}) {
  switch (secim.gosterge) {
    case 'aktif':
      return <Aktif kurumId={kurumId} donem={donem} secim={secim} />;
    case 'devam':
    case 'anladim':
    case 'plan':
      return <OranListesi kurumId={kurumId} donem={donem} secim={secim} />;
    case 'odev':
      return <OdevListesi kurumId={kurumId} donem={donem} secim={secim} />;
    case 'soru':
      return <SoruListesi kurumId={kurumId} donem={donem} secim={secim} />;
  }
}

interface SorguDurumu<T> {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data: T | undefined;
  refetch: () => Promise<unknown>;
}

/** Yukleniyor / hata / bos durumlarini ortak yoneten sarmalayici. */
function Durumlu<T extends { toplam_satir: number }>({
  q,
  children,
}: {
  q: SorguDurumu<T>;
  children: (veri: T) => ReactNode;
}) {
  if (q.isPending) return <ListeIskeleti satir={4} />;
  if (q.isError) {
    return (
      <HataDurumu
        baslik={t('rapor.altListe.yuklenemedi')}
        aciklama={hataMesaji(q.error)}
        tekrarDene={() => void q.refetch()}
        className="py-8"
      />
    );
  }
  if (!q.data || q.data.toplam_satir === 0) {
    return (
      <BosDurum
        className="py-10"
        ikon={ListChecks}
        baslik={t('rapor.altListe.bos')}
        aciklama={t('rapor.altListe.bosAciklama')}
      />
    );
  }
  return <>{children(q.data)}</>;
}

function Ozet({ toplam, gosterilen }: { toplam: number; gosterilen: number }) {
  return (
    <p className="border-b border-kenar px-4 py-2 text-sm text-metin-ikincil">
      {toplam > gosterilen
        ? t('rapor.altListe.kesildi', { n: gosterilen, toplam })
        : t('rapor.altListe.toplam', { n: toplam })}
    </p>
  );
}

function OgrenciBagi({ kurumId, id, ad }: { kurumId: string; id: string; ad: string | null }) {
  const goruntu = ad ?? t('rapor.altListe.adsiz');
  return (
    <Link
      href={`/${kurumId}/ogrenciler/${id}`}
      aria-label={t('rapor.altListe.ogrenciyeGit', { ad: goruntu })}
      className="font-medium text-birincil underline-offset-2 hover:underline"
    >
      {goruntu}
    </Link>
  );
}

function Tablo({
  aciklama,
  sutunlar,
  children,
}: {
  aciklama: string;
  sutunlar: Sutun[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <caption className="sr-only">{aciklama}</caption>
        <thead className="text-metin-ikincil">
          <tr className="border-b border-kenar">
            {sutunlar.map((s) => (
              <th key={s.baslik} scope="col" className={`${th}${s.sagda ? ' text-right' : ''}`}>
                {s.baslik}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const hucre = 'px-3 py-2.5 tabular-nums';

function Aktif({
  kurumId,
  donem,
  secim,
}: {
  kurumId: string;
  donem: RaporDonemi;
  secim: AltListeSecimi;
}) {
  const q = useRaporListe(kurumId, 'aktif', donem, secim);
  return (
    <Durumlu q={q}>
      {(v) => (
        <>
          <Ozet toplam={v.toplam_satir} gosterilen={v.satirlar.length} />
          <Tablo
            aciklama={t('rapor.gosterge.aktif')}
            sutunlar={[{ baslik: t('rapor.sutun.ogrenci') }, { baslik: t('rapor.sutun.gruplar') }]}
          >
            {v.satirlar.map((s) => (
              <tr key={s.ogrenci_id} className="border-b border-kenar last:border-0">
                <th scope="row" className={`${hucre} font-normal`}>
                  <OgrenciBagi kurumId={kurumId} id={s.ogrenci_id} ad={s.gorunen_ad} />
                </th>
                <td className={hucre}>{s.gruplar.join(', ') || '—'}</td>
              </tr>
            ))}
          </Tablo>
        </>
      )}
    </Durumlu>
  );
}

/** Devam, anladim ve plan: ogrenci bazinda oran + gosterge ayrintisi. */
function OranListesi({
  kurumId,
  donem,
  secim,
}: {
  kurumId: string;
  donem: RaporDonemi;
  secim: AltListeSecimi;
}) {
  const gosterge = secim.gosterge as 'devam' | 'anladim' | 'plan';
  const q = useRaporListe(kurumId, gosterge, donem, secim);
  const ayrinti: Record<'devam' | 'anladim' | 'plan', string[]> = {
    devam: ['geldi', 'gec', 'gelmedi', 'izinli'],
    anladim: ['anladim', 'kismen', 'anlamadim'],
    plan: ['tamam', 'kismen', 'yapilmadi', 'bekliyor'],
  };
  const anahtarlar = ayrinti[gosterge];
  return (
    <Durumlu q={q}>
      {(v) => {
        const satirlar = v.satirlar;
        return (
          <>
            <Ozet toplam={v.toplam_satir} gosterilen={satirlar.length} />
            <Tablo
              aciklama={t(`rapor.gosterge.${gosterge}`)}
              sutunlar={[
                { baslik: t('rapor.sutun.ogrenci') },
                { baslik: t('rapor.sutun.oran'), sagda: true },
                ...anahtarlar.map((a) => ({
                  baslik: t(`rapor.sutun.${a}` as 'rapor.sutun.geldi'),
                  sagda: true,
                })),
              ]}
            >
              {satirlar.map((s) => (
                <tr key={s.ogrenci_id} className="border-b border-kenar last:border-0">
                  <th scope="row" className={`${hucre} font-normal`}>
                    <OgrenciBagi kurumId={kurumId} id={s.ogrenci_id} ad={s.gorunen_ad} />
                  </th>
                  <td className={`${hucre} text-right font-medium`}>
                    {yuzdeYaz(s.oran)}
                    <span className="ml-1 text-metin-ikincil">
                      ({s.pay}/{s.payda})
                    </span>
                  </td>
                  {anahtarlar.map((a) => (
                    <td key={a} className={`${hucre} text-right`}>
                      {s.ayrinti[a] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </Tablo>
          </>
        );
      }}
    </Durumlu>
  );
}

function OdevListesi({
  kurumId,
  donem,
  secim,
}: {
  kurumId: string;
  donem: RaporDonemi;
  secim: AltListeSecimi;
}) {
  const q = useRaporListe(kurumId, 'odev', donem, secim);
  return (
    <Durumlu q={q}>
      {(v) => (
        <>
          <Ozet toplam={v.toplam_satir} gosterilen={v.satirlar.length} />
          <Tablo
            aciklama={t('rapor.gosterge.odev')}
            sutunlar={[
              { baslik: t('rapor.sutun.ogrenci') },
              { baslik: t('rapor.sutun.odev') },
              { baslik: t('rapor.sutun.sonTeslim') },
              { baslik: t('rapor.sutun.durum') },
            ]}
          >
            {v.satirlar.map((s) => (
              <tr key={s.ogrenci_odev_id} className="border-b border-kenar last:border-0">
                <th scope="row" className={`${hucre} font-normal`}>
                  <OgrenciBagi kurumId={kurumId} id={s.ogrenci_id} ad={s.gorunen_ad} />
                </th>
                <td className={hucre}>{s.baslik}</td>
                <td className={hucre}>{tarihYaz(s.son_teslim_at)}</td>
                <td className={hucre}>
                  <Rozet ton="uyari">{t('rapor.odevDurum.atandi')}</Rozet>
                </td>
              </tr>
            ))}
          </Tablo>
        </>
      )}
    </Durumlu>
  );
}

function SoruListesi({
  kurumId,
  donem,
  secim,
}: {
  kurumId: string;
  donem: RaporDonemi;
  secim: AltListeSecimi;
}) {
  const q = useRaporListe(kurumId, 'soru', donem, secim);
  return (
    <Durumlu q={q}>
      {(v) => (
        <>
          <Ozet toplam={v.toplam_satir} gosterilen={v.satirlar.length} />
          <Tablo
            aciklama={t('rapor.gosterge.soru')}
            sutunlar={[
              { baslik: t('rapor.sutun.ogrenci') },
              { baslik: t('rapor.sutun.brans') },
              { baslik: t('rapor.sutun.sorulma') },
              { baslik: t('rapor.sutun.cevapSuresi'), sagda: true },
            ]}
          >
            {v.satirlar.map((s) => (
              <tr key={s.soru_id} className="border-b border-kenar last:border-0">
                <th scope="row" className={`${hucre} font-normal`}>
                  <OgrenciBagi kurumId={kurumId} id={s.ogrenci_id} ad={s.gorunen_ad} />
                </th>
                <td className={hucre}>{bransAdi(s.brans_kodu)}</td>
                <td className={hucre}>{tarihYaz(s.sorulma_at)}</td>
                <td className={`${hucre} text-right`}>
                  {s.ilk_cevap_sn === null ? (
                    <Rozet ton="uyari">{t('rapor.sutun.cevapBekliyor')}</Rozet>
                  ) : (
                    sureYaz(s.ilk_cevap_sn)
                  )}
                </td>
              </tr>
            ))}
          </Tablo>
        </>
      )}
    </Durumlu>
  );
}
