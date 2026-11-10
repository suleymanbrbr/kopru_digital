'use client';

import type { Konu } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { Rozet } from '@/components/ui/rozet';
import { Secim } from '@/components/ui/secim';
import { bransAdi } from '@/lib/bransler';
import { cn } from '@/lib/cn';
import {
  agaciDuzlestir,
  agaciSuz,
  konuAgaci,
  konuYolu,
  sonKonuEkle,
  sonKonulariOku,
} from '@/lib/ogrenme/konu';
import { useKonular } from '@/lib/ogrenme/veri';
import { trSirala } from '@/lib/sirala';

/**
 * Ortak konu secici (odev ve plan formlari): katalog + brans suzgeci, Turkce duyarsiz arama,
 * unite > konu > alt konu agaci, kullanimdan kalkan konu rozetli ve secilemez, son kullanilanlar ustte
 * (yerel). Ac (1) + konuya dokun (2) = secim.
 */
export function KonuSecici({
  kurumId,
  deger,
  degisti,
  brans,
  etiket = t('ogrenme.konu.etiket'),
}: {
  kurumId: string;
  deger: string | null;
  degisti: (konu: Konu | null) => void;
  /** Verilirse yalniz bu branstaki konular listelenir (ornegin odev branslari ile tutarli). */
  brans?: string;
  etiket?: string;
}) {
  const kimlik = useId();
  const konular = useKonular(kurumId);
  const [acik, setAcik] = useState(false);
  const [arama, setArama] = useState('');
  const [katalog, setKatalog] = useState('');
  const [bransSuzgeci, setBransSuzgeci] = useState('');
  const [sonlar, setSonlar] = useState<string[]>(() => sonKonulariOku(kurumId));
  const kok = useRef<HTMLDivElement>(null);

  // Disina tiklaninca ya da Esc ile kapanir.
  useEffect(() => {
    if (!acik) return;
    const tik = (e: MouseEvent) => {
      if (kok.current && !kok.current.contains(e.target as Node)) setAcik(false);
    };
    document.addEventListener('mousedown', tik);
    return () => {
      document.removeEventListener('mousedown', tik);
    };
  }, [acik]);

  const tum = useMemo(() => new Map((konular.data ?? []).map((k) => [k.id, k])), [konular.data]);
  const secili = deger ? tum.get(deger) : undefined;
  const aktifBrans = brans ?? bransSuzgeci;

  const katalogSecenekleri = useMemo(
    () => [...new Set((konular.data ?? []).map((k) => k.katalog_kodu).filter((x) => x !== null))],
    [konular.data],
  );
  const bransSecenekleri = useMemo(
    () =>
      trSirala(
        [...new Set((konular.data ?? []).map((k) => k.brans_kodu))].map((kod) => ({
          kod,
          ad: bransAdi(kod),
        })),
        (b) => b.ad,
      ),
    [konular.data],
  );

  const satirlar = useMemo(() => {
    const agac = konuAgaci(konular.data ?? []);
    const suzulmus = agaciSuz(agac, {
      ...(katalog ? { katalog } : {}),
      ...(aktifBrans ? { brans: aktifBrans } : {}),
      arama,
    });
    return agaciDuzlestir(suzulmus);
  }, [konular.data, katalog, aktifBrans, arama]);

  const sonKonular = useMemo(
    () =>
      arama.trim() === ''
        ? sonlar
            .map((id) => tum.get(id))
            .filter((k): k is Konu => k !== undefined && !k.kullanimdan_kalkti)
            .filter((k) => !aktifBrans || k.brans_kodu === aktifBrans)
        : [],
    [sonlar, tum, arama, aktifBrans],
  );

  const sec = (k: Konu) => {
    if (k.kullanimdan_kalkti) return;
    setSonlar(sonKonuEkle(kurumId, k.id));
    degisti(k);
    setAcik(false);
    setArama('');
  };

  return (
    <div ref={kok} className="relative flex flex-col gap-1.5">
      <label htmlFor={`${kimlik}-dugme`} className="text-sm font-medium">
        {etiket}
      </label>
      <div className="flex gap-2">
        <button
          id={`${kimlik}-dugme`}
          type="button"
          aria-expanded={acik}
          aria-controls={`${kimlik}-panel`}
          onClick={() => {
            setAcik((a) => !a);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setAcik(false);
          }}
          className="flex h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-orta border border-kenar bg-yuzey px-3 text-left text-base"
        >
          <span className={cn('truncate', !secili && 'text-metin-ikincil')}>
            {secili ? konuYolu(secili, tum) : t('ogrenme.konu.sec')}
          </span>
          {secili?.kullanimdan_kalkti ? (
            <Rozet ton="uyari">{t('ogrenme.konu.kullanimdanKalkti')}</Rozet>
          ) : null}
          <ChevronDown className="size-4 shrink-0 text-metin-ikincil" aria-hidden />
        </button>
        {secili ? (
          <Dugme
            type="button"
            gorunum="ikincil"
            boyut="ikon"
            aria-label={t('ogrenme.konu.temizle')}
            onClick={() => {
              degisti(null);
            }}
          >
            <X aria-hidden />
          </Dugme>
        ) : null}
      </div>

      {acik ? (
        <div
          id={`${kimlik}-panel`}
          role="group"
          aria-label={t('ogrenme.konu.panel')}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setAcik(false);
            }
          }}
          className="absolute left-0 right-0 top-full z-30 mt-1 rounded-buyuk border border-kenar bg-yuzey p-3 shadow-xl"
        >
          <div className="relative">
            <label htmlFor={`${kimlik}-ara`} className="sr-only">
              {t('ogrenme.konu.ara')}
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-metin-ikincil"
              aria-hidden
            />
            <Girdi
              id={`${kimlik}-ara`}
              type="search"
              autoFocus
              className="pl-9"
              placeholder={t('ogrenme.konu.araYer')}
              value={arama}
              onChange={(e) => {
                setArama(e.target.value);
              }}
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${kimlik}-katalog`} className="sr-only">
                {t('ogrenme.konu.katalog')}
              </label>
              <Secim
                id={`${kimlik}-katalog`}
                value={katalog}
                onChange={(e) => {
                  setKatalog(e.target.value);
                }}
              >
                <option value="">{t('ogrenme.konu.tumKataloglar')}</option>
                {katalogSecenekleri.map((k) => (
                  <option key={k} value={k}>
                    {k.toUpperCase()}
                  </option>
                ))}
              </Secim>
            </div>
            {brans === undefined ? (
              <div>
                <label htmlFor={`${kimlik}-brans`} className="sr-only">
                  {t('ogrenme.konu.brans')}
                </label>
                <Secim
                  id={`${kimlik}-brans`}
                  value={bransSuzgeci}
                  onChange={(e) => {
                    setBransSuzgeci(e.target.value);
                  }}
                >
                  <option value="">{t('ogrenme.konu.tumBranslar')}</option>
                  {bransSecenekleri.map((b) => (
                    <option key={b.kod} value={b.kod}>
                      {b.ad}
                    </option>
                  ))}
                </Secim>
              </div>
            ) : null}
          </div>

          <div className="mt-3 max-h-72 overflow-y-auto" aria-live="polite">
            {konular.isPending ? (
              <p role="status" className="px-1 py-3 text-sm text-metin-ikincil">
                {t('ortak.yukleniyor')}
              </p>
            ) : konular.isError ? (
              <p role="alert" className="px-1 py-3 text-sm text-hata">
                {t('ogrenme.konu.yuklenemedi')}
              </p>
            ) : (
              <>
                {sonKonular.length > 0 ? (
                  <section aria-label={t('ogrenme.konu.sonKullanilanlar')} className="mb-3">
                    <h4 className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-metin-ikincil">
                      {t('ogrenme.konu.sonKullanilanlar')}
                    </h4>
                    <ul className="flex flex-col">
                      {sonKonular.map((k) => (
                        <li key={k.id}>
                          <KonuSatiri konu={k} yol={konuYolu(k, tum)} sec={sec} derinlik={0} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {satirlar.length === 0 ? (
                  <p className="px-1 py-3 text-sm text-metin-ikincil">
                    {t('ogrenme.konu.bulunamadi')}
                  </p>
                ) : (
                  <ul className="flex flex-col">
                    {satirlar.map(({ konu, derinlik }) => (
                      <li key={konu.id}>
                        <KonuSatiri konu={konu} sec={sec} derinlik={derinlik} />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KonuSatiri({
  konu,
  yol,
  derinlik,
  sec,
}: {
  konu: Konu;
  yol?: string;
  derinlik: number;
  sec: (k: Konu) => void;
}) {
  const kalkti = konu.kullanimdan_kalkti;
  return (
    <button
      type="button"
      disabled={kalkti}
      onClick={() => {
        sec(konu);
      }}
      style={{ paddingLeft: `${String(0.5 + derinlik * 1.25)}rem` }}
      className={cn(
        'flex min-h-10 w-full items-center justify-between gap-2 rounded-orta py-1.5 pr-2 text-left text-sm hover:bg-yuzey-ikincil disabled:cursor-not-allowed disabled:opacity-60',
        konu.seviye === 'unite' && 'font-semibold',
      )}
    >
      <span className="min-w-0 truncate">{yol ?? konu.ad}</span>
      {kalkti ? <Rozet ton="uyari">{t('ogrenme.konu.kullanimdanKalkti')}</Rozet> : null}
    </button>
  );
}
