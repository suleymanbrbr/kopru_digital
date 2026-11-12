'use client';

import type { SoruOzet } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { FileQuestion, MessageSquareText, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { DahaFazla, ListeIskeleti, zamanYaz } from '@/components/hesap/ortak';
import { KonuSecici } from '@/components/ogrenme/konu-secici';
import { OgrenciSecimi } from '@/components/ogrenme/ortak';
import { Alan } from '@/components/operasyon/ortak';
import { Girdi } from '@/components/ui/input';
import { Rozet } from '@/components/ui/rozet';
import { Secim } from '@/components/ui/secim';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { bransAdi, siraliBransler } from '@/lib/bransler';
import { useOgrenciler } from '@/lib/ogrenme/veri';
import { useOgretmenler } from '@/lib/operasyon-verisi';
import { DURUM_TONU, SORU_DURUMLARI, bekliyorMu, goreliZaman, soruBasligi } from '@/lib/soru/soru';
import {
  useCevapladigimSorular,
  useGelenSorular,
  useSorularim,
  useYonetimSorulari,
  type SoruSuzgeci,
} from '@/lib/soru/veri';

export type ArsivKaynagi = 'sorularim' | 'gelen' | 'cevapladigim' | 'yonetim';

interface Ozellikler {
  ogrenciSuzgeci: boolean;
  ogretmenSuzgeci: boolean;
  konuSuzgeci: boolean;
  durumSuzgeci: boolean;
  arama: boolean;
  ogrenciGoster: boolean;
  /** Bekleyenler listesi: "en eski once" notu ve bekleme suresi. */
  enEskiOnce: boolean;
}

const OZELLIKLER: Record<ArsivKaynagi, Ozellikler> = {
  sorularim: {
    ogrenciSuzgeci: false,
    ogretmenSuzgeci: false,
    konuSuzgeci: true,
    durumSuzgeci: true,
    arama: true,
    ogrenciGoster: false,
    enEskiOnce: false,
  },
  gelen: {
    ogrenciSuzgeci: true,
    ogretmenSuzgeci: false,
    konuSuzgeci: false,
    durumSuzgeci: false,
    arama: false,
    ogrenciGoster: true,
    enEskiOnce: true,
  },
  cevapladigim: {
    ogrenciSuzgeci: true,
    ogretmenSuzgeci: false,
    konuSuzgeci: false,
    durumSuzgeci: false,
    arama: true,
    ogrenciGoster: true,
    enEskiOnce: false,
  },
  yonetim: {
    ogrenciSuzgeci: true,
    ogretmenSuzgeci: true,
    konuSuzgeci: false,
    durumSuzgeci: true,
    arama: true,
    ogrenciGoster: true,
    enEskiOnce: false,
  },
};

function useGeciken<T>(deger: T, ms = 300): T {
  const [g, setG] = useState(deger);
  useEffect(() => {
    const z = setTimeout(() => {
      setG(deger);
    }, ms);
    return () => {
      clearTimeout(z);
    };
  }, [deger, ms]);
  return g;
}

/**
 * Soru listesi (ogrenci arsivi, ogretmen kuyrugu ve arsivi, yonetici "tum yazismalar"): suzgecler, arama,
 * durum rozetleri ve "daha fazla". Satir soru detayina baglanir (`hrefKok/<id>`).
 */
export function SoruArsivi({
  kaynak,
  hrefKok,
  etiket,
}: {
  kaynak: ArsivKaynagi;
  hrefKok: string;
  etiket: string;
}) {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const o = OZELLIKLER[kaynak];
  const kimlik = useId();
  const [brans, setBrans] = useState('');
  const [konuId, setKonuId] = useState<string | null>(null);
  const [durum, setDurum] = useState('');
  const [arama, setArama] = useState('');
  const [ogrenciId, setOgrenciId] = useState('');
  const [ogretmenId, setOgretmenId] = useState('');
  const q = useGeciken(arama.trim());
  const suzgec: SoruSuzgeci = {
    ...(brans ? { brans } : {}),
    ...(konuId ? { konuId } : {}),
    ...(durum ? { durum } : {}),
    ...(q ? { q } : {}),
    ...(ogrenciId ? { ogrenciId } : {}),
    ...(ogretmenId ? { ogretmenId } : {}),
  };
  const ogrenciler = useOgrenciler(kurumId, o.ogrenciSuzgeci);
  const ogretmenler = useOgretmenler(kurumId, o.ogretmenSuzgeci);

  // Her kaynak icin yalniz kendi sorgusu etkindir.
  const benim = useSorularim(kurumId, suzgec, kaynak === 'sorularim');
  const gelen = useGelenSorular(kurumId, suzgec, kaynak === 'gelen');
  const cevapladigim = useCevapladigimSorular(kurumId, suzgec, kaynak === 'cevapladigim');
  const yonetim = useYonetimSorulari(kurumId, suzgec, kaynak === 'yonetim');
  const veri = { sorularim: benim, gelen, cevapladigim, yonetim }[kaynak];
  const suzgecVar = Object.keys(suzgec).length > 0;

  return (
    <section aria-label={etiket} className="rounded-buyuk border border-kenar bg-yuzey">
      <div className="flex flex-col gap-3 border-b border-kenar p-4">
        {o.enEskiOnce ? (
          <p className="text-sm text-metin-ikincil">{t('soruSor.arsiv.enEskiOnce')}</p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Alan etiket={t('soruSor.arsiv.brans')}>
            {(a) => (
              <Secim
                {...a}
                value={brans}
                onChange={(e) => {
                  setBrans(e.target.value);
                  setKonuId(null);
                }}
              >
                <option value="">{t('ogrenme.ortak.tumu')}</option>
                {siraliBransler().map((b) => (
                  <option key={b.kod} value={b.kod}>
                    {b.ad}
                  </option>
                ))}
              </Secim>
            )}
          </Alan>
          {o.konuSuzgeci ? (
            <KonuSecici
              kurumId={kurumId}
              deger={konuId}
              {...(brans ? { brans } : {})}
              etiket={t('soruSor.arsiv.konu')}
              degisti={(k) => {
                setKonuId(k?.id ?? null);
              }}
            />
          ) : null}
          {o.durumSuzgeci ? (
            <Alan etiket={t('soruSor.arsiv.durum')}>
              {(a) => (
                <Secim
                  {...a}
                  value={durum}
                  onChange={(e) => {
                    setDurum(e.target.value);
                  }}
                >
                  <option value="">{t('ogrenme.ortak.tumu')}</option>
                  {SORU_DURUMLARI.map((d) => (
                    <option key={d} value={d}>
                      {t(`soruSor.durum.${d}`)}
                    </option>
                  ))}
                </Secim>
              )}
            </Alan>
          ) : null}
          {o.ogrenciSuzgeci ? (
            <OgrenciSecimi
              deger={ogrenciId}
              degisti={setOgrenciId}
              ogrenciler={ogrenciler.liste}
              etiket={t('soruSor.arsiv.ogrenci')}
              bosEtiket={t('ogrenme.ortak.tumu')}
            />
          ) : null}
          {o.ogretmenSuzgeci ? (
            <Alan etiket={t('soruSor.arsiv.ogretmen')}>
              {(a) => (
                <Secim
                  {...a}
                  value={ogretmenId}
                  onChange={(e) => {
                    setOgretmenId(e.target.value);
                  }}
                >
                  <option value="">{t('ogrenme.ortak.tumu')}</option>
                  {ogretmenler.liste.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.ad}
                    </option>
                  ))}
                </Secim>
              )}
            </Alan>
          ) : null}
          {o.arama ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${kimlik}-ara`} className="text-sm font-medium">
                {t('soruSor.arsiv.ara')}
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-metin-ikincil"
                  aria-hidden
                />
                <Girdi
                  id={`${kimlik}-ara`}
                  type="search"
                  className="pl-9"
                  value={arama}
                  placeholder={t('soruSor.arsiv.araOrnek')}
                  onChange={(e) => {
                    setArama(e.target.value);
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {veri.isPending ? (
        <ListeIskeleti satir={3} />
      ) : veri.isError ? (
        <HataDurumu
          baslik={t('soruSor.arsiv.yuklenemedi')}
          aciklama={hataMesaji(veri.error)}
          tekrarDene={() => void veri.refetch()}
        />
      ) : veri.sorular.length === 0 ? (
        <BosDurum
          className="py-14"
          ikon={kaynak === 'gelen' ? MessageSquareText : FileQuestion}
          baslik={suzgecVar ? t('soruSor.arsiv.bosSuzgec') : t(`soruSor.arsiv.bos.${kaynak}`)}
          aciklama={
            suzgecVar
              ? t('soruSor.arsiv.bosSuzgecAciklama')
              : t(`soruSor.arsiv.bosAciklama.${kaynak}`)
          }
        />
      ) : (
        <ul className="divide-y divide-kenar" data-testid="soru-listesi">
          {veri.sorular.map((s) => (
            <SoruSatiri
              key={s.id}
              soru={s}
              href={`${hrefKok}/${s.id}`}
              ogrenciGoster={o.ogrenciGoster}
              bekleme={o.enEskiOnce}
            />
          ))}
        </ul>
      )}
      <DahaFazla
        daha={veri.hasNextPage}
        yukleniyor={veri.isFetchingNextPage}
        yukle={() => void veri.fetchNextPage()}
      />
    </section>
  );
}

export function DurumRozeti({ durum }: { durum: SoruOzet['durum'] }) {
  return <Rozet ton={DURUM_TONU[durum]}>{t(`soruSor.durum.${durum}`)}</Rozet>;
}

function SoruSatiri({
  soru: s,
  href,
  ogrenciGoster,
  bekleme,
}: {
  soru: SoruOzet;
  href: string;
  ogrenciGoster: boolean;
  bekleme: boolean;
}) {
  const baslik = soruBasligi(s) || t('soruSor.arsiv.basliksiz');
  return (
    <li>
      <Link
        href={href}
        data-testid="soru-satiri"
        className="flex flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-yuzey-ikincil"
      >
        <span className="flex flex-wrap items-center gap-2">
          <DurumRozeti durum={s.durum} />
          <Rozet>{bransAdi(s.brans_kodu)}</Rozet>
          {ogrenciGoster && s.ogrenci_adi ? (
            <span className="text-sm font-medium">{s.ogrenci_adi}</span>
          ) : null}
        </span>
        <span className="font-medium">{baslik}</span>
        {s.baslik && s.metin_onizleme ? (
          <span className="line-clamp-1 text-sm text-metin-ikincil">{s.metin_onizleme}</span>
        ) : null}
        <span className="text-xs text-metin-ikincil">
          {bekleme && bekliyorMu(s.durum)
            ? t('soruSor.arsiv.bekliyor', { sure: goreliZaman(s.son_hareket_at) })
            : zamanYaz(s.son_hareket_at)}
          {' · '}
          {t('soruSor.arsiv.mesajSayisi', { n: s.mesaj_sayisi })}
        </span>
      </Link>
    </li>
  );
}
