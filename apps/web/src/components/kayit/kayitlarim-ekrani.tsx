'use client';

import type { KayitlarimSatiriSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { ChevronDown, CircleCheck, ExternalLink, Layers, TriangleAlert } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState, type SyntheticEvent } from 'react';
import type { z } from 'zod';

import { BOS_SUZGEC, KayitSuzgecleri, aralikGecersiz, suzgecSayisi } from './kayit-suzgecleri';
import { SaglayiciEtiketi, SaglayiciIkonu } from './saglayici-etiketi';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import {
  BildirimKutusu,
  DahaFazla,
  KopyalaDugmesi,
  ListeIskeleti,
  basari,
  tarihYaz,
  type Bildirim,
} from '@/components/hesap/ortak';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Alan } from '@/components/operasyon/ortak';
import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { Iskelet } from '@/components/ui/kart';
import { Rozet } from '@/components/ui/rozet';
import { Secim } from '@/components/ui/secim';
import { Uyari } from '@/components/ui/uyari';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { bransAdi } from '@/lib/bransler';
import { cn } from '@/lib/cn';
import { dersIstek } from '@/lib/hesap-istek';
import { guvenliAdres } from '@/lib/kayit/saglayici';
import {
  kayitAnahtari,
  useKayitlarim,
  useKayitlarimDetay,
  type KaynakSuzgeci,
} from '@/lib/kayit/veri';

type Satir = z.infer<typeof KayitlarimSatiriSema>;
interface Sayfa {
  kayitlar: Satir[];
  sonraki_imlec: string | null;
}

export function KayitlarimEkrani() {
  return (
    <BolumKapisi bolum="kayitlarim">
      <KayitlarimIcerigi />
    </BolumKapisi>
  );
}

function KayitlarimIcerigi() {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const params = useSearchParams();
  const dersParam = params.get('ders') ?? '';
  const kayitParam = params.get('kayit');
  const [suzgec, setSuzgec] = useState<KaynakSuzgeci>(
    dersParam ? { ders_id: dersParam } : BOS_SUZGEC,
  );
  const gecersiz = aralikGecersiz(suzgec);
  const q = useKayitlarim(kurumId, suzgec, !gecersiz);
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const suzuldu = suzgecSayisi(suzgec) > 0;

  return (
    <>
      <SayfaBasligi
        baslik={t('nav.kayitlarim')}
        aciklama={t('kayitGeriBildirim.kayitlarim.aciklama')}
      />
      <div className="mb-4 empty:hidden">
        <BildirimKutusu bildirim={bildirim} />
      </div>
      {kayitParam ? (
        <BildirimdenGelen
          kurumId={kurumId}
          kaynakId={kayitParam}
          bildir={(m) => {
            setBildirim(basari(m));
          }}
        />
      ) : null}
      <section
        aria-label={t('kayitGeriBildirim.kayitlarim.liste')}
        className="rounded-buyuk border border-kenar bg-yuzey"
      >
        <KayitSuzgecleri kurumId={kurumId} deger={suzgec} degisti={setSuzgec} />
        {gecersiz ? (
          <BosDurum
            className="py-12"
            ikon={Layers}
            baslik={t('kayitGeriBildirim.suzgec.aralikHata')}
            aciklama={t('kayitGeriBildirim.suzgec.aralikHataAciklama')}
          />
        ) : q.isPending ? (
          <ListeIskeleti satir={4} />
        ) : q.isError ? (
          <HataDurumu
            baslik={t('kayitGeriBildirim.kayitlarim.yuklenemedi')}
            aciklama={hataMesaji(q.error)}
            tekrarDene={() => void q.refetch()}
          />
        ) : q.kayitlar.length === 0 ? (
          <BosDurum
            className="py-14"
            ikon={Layers}
            baslik={
              suzuldu
                ? t('kayitGeriBildirim.kayitlarim.bosSuzgec')
                : t('kayitGeriBildirim.kayitlarim.bos')
            }
            aciklama={
              suzuldu
                ? t('kayitGeriBildirim.kayitlarim.bosSuzgecAciklama')
                : t('kayitGeriBildirim.kayitlarim.bosAciklama')
            }
          />
        ) : (
          <ul className="divide-y divide-kenar" aria-busy={q.isFetching}>
            {q.kayitlar
              .filter((k) => k.id !== kayitParam)
              .map((k) => (
                <KayitSatiri
                  key={k.id}
                  kurumId={kurumId}
                  satir={k}
                  bildir={(m) => {
                    setBildirim(basari(m));
                  }}
                />
              ))}
          </ul>
        )}
        <DahaFazla
          daha={q.hasNextPage}
          yukleniyor={q.isFetchingNextPage}
          yukle={() => void q.fetchNextPage()}
        />
      </section>
    </>
  );
}

/** Bildirimdeki baglantiyla gelinen kayit: listede olmasa da dogrudan acik gosterilir. */
function BildirimdenGelen({
  kurumId,
  kaynakId,
  bildir,
}: {
  kurumId: string;
  kaynakId: string;
  bildir: (m: string) => void;
}) {
  const q = useKayitlarimDetay(kurumId, kaynakId);
  if (q.isPending) return <Iskelet className="mb-4 h-16 w-full" />;
  if (q.isError) return <Uyari className="mb-4">{hataMesaji(q.error)}</Uyari>;
  return (
    <ul className="mb-4 rounded-buyuk border border-birincil bg-yuzey">
      <KayitSatiri kurumId={kurumId} satir={q.data} bildir={bildir} baslangicAcik />
    </ul>
  );
}

function KayitSatiri({
  kurumId,
  satir: k,
  bildir,
  baslangicAcik = false,
}: {
  kurumId: string;
  satir: Satir;
  bildir: (m: string) => void;
  baslangicAcik?: boolean;
}) {
  const [acik, setAcik] = useState(baslangicAcik);
  const panelId = `kayit-${k.id}`;
  return (
    <li className="flex flex-col" data-testid="kayit-satiri">
      <button
        type="button"
        aria-expanded={acik}
        aria-controls={panelId}
        onClick={() => {
          setAcik((a) => !a);
        }}
        className="flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left hover:bg-yuzey-ikincil/60"
      >
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-orta bg-yuzey-ikincil">
          <SaglayiciIkonu saglayici={k.saglayici} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block break-words', k.izlendi ? 'font-medium' : 'font-semibold')}>
            {k.baslik}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-metin-ikincil">
            <SaglayiciEtiketi saglayici={k.saglayici} />
            <span>
              {k.ders_baslangic_at
                ? tarihYaz(k.ders_baslangic_at)
                : t('kayitGeriBildirim.kayitlarim.eklendi', { tarih: tarihYaz(k.created_at) })}
            </span>
            {k.brans_kodu ? <span>{bransAdi(k.brans_kodu)}</span> : null}
            {k.tur === 'materyal' ? <span>{t('kayitGeriBildirim.tur.materyal')}</span> : null}
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {k.bozuk ? (
            <Rozet ton="uyari">
              <TriangleAlert className="mr-1 size-3" aria-hidden />
              {t('kayitGeriBildirim.kayitlarim.bozuk')}
            </Rozet>
          ) : null}
          {k.izlendi ? (
            <Rozet ton="basari">
              <CircleCheck className="mr-1 size-3" aria-hidden />
              {t('kayitGeriBildirim.kayitlarim.izlendi')}
            </Rozet>
          ) : (
            <Rozet ton="bilgi">{t('kayitGeriBildirim.kayitlarim.izlenmedi')}</Rozet>
          )}
          <ChevronDown
            className={cn('size-4 text-metin-ikincil transition-transform', acik && 'rotate-180')}
            aria-hidden
          />
        </span>
      </button>
      <div id={panelId} hidden={!acik}>
        {acik ? <KayitAyrintisi kurumId={kurumId} satir={k} bildir={bildir} /> : null}
      </div>
    </li>
  );
}

function KayitAyrintisi({
  kurumId,
  satir: k,
  bildir,
}: {
  kurumId: string;
  satir: Satir;
  bildir: (m: string) => void;
}) {
  const qc = useQueryClient();
  const detay = useKayitlarimDetay(kurumId, k.id);
  const [sorunFormu, setSorunFormu] = useState(false);
  const [izlendi, setIzlendi] = useState(k.izlendi);

  /** Listeyi yeniden siralamadan (satir ziplamasin) izlendi isaretini onbellekte gunceller. */
  const onbellegiIsle = () => {
    qc.setQueriesData<InfiniteData<Sayfa>>(
      { queryKey: [...kayitAnahtari(kurumId), 'kayitlarim'] },
      (veri) =>
        veri && 'pages' in veri
          ? {
              ...veri,
              pages: veri.pages.map((s) => ({
                ...s,
                kayitlar: s.kayitlar.map((x) => (x.id === k.id ? { ...x, izlendi: true } : x)),
              })),
            }
          : veri,
    );
  };
  const izledim = useMutation({
    mutationFn: () =>
      dersIstek(`kurumlar/${kurumId}/kayitlarim/${k.id}/izledim`, { yontem: 'POST' }),
    onSuccess: () => {
      setIzlendi(true);
      onbellegiIsle();
    },
  });

  if (detay.isPending) {
    return (
      <div
        role="status"
        aria-label={t('ortak.yukleniyor')}
        className="flex flex-col gap-2 px-4 pb-4"
      >
        <Iskelet className="h-9 w-40" />
        <Iskelet className="h-5 w-56" />
      </div>
    );
  }
  if (detay.isError) {
    return (
      <HataDurumu
        baslik={t('kayitGeriBildirim.kayitlarim.ayrintiYuklenemedi')}
        aciklama={hataMesaji(detay.error)}
        tekrarDene={() => void detay.refetch()}
        className="py-4"
      />
    );
  }
  const d = detay.data;
  const adres = guvenliAdres(d.url);
  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pl-16">
      {d.bozuk ? (
        <p className="flex items-start gap-2 rounded-orta bg-uyari-yumusak px-3 py-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('kayitGeriBildirim.kayitlarim.bozukAciklama')}
        </p>
      ) : null}
      {d.gecerlilik_bitis_at ? (
        <p className="text-sm text-metin-ikincil">
          {t('kayitGeriBildirim.kart.sonErisim', { tarih: tarihYaz(d.gecerlilik_bitis_at) })}
        </p>
      ) : null}
      {d.parola ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-metin-ikincil">{t('kayitGeriBildirim.kayitlarim.parola')}</span>
          <code className="rounded-kucuk bg-yuzey-ikincil px-2 py-1 font-mono">{d.parola}</code>
          <KopyalaDugmesi
            metin={d.parola}
            etiket={t('kayitGeriBildirim.kayitlarim.parolaKopyala')}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {adres ? (
          <a
            href={adres}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              if (!izlendi && !izledim.isPending) izledim.mutate();
            }}
            className="inline-flex h-11 items-center gap-2 rounded-orta bg-birincil px-4 text-sm font-medium text-birincil-uzeri hover:bg-birincil/90"
          >
            {t('kayitGeriBildirim.kayitlarim.ac')}
            <ExternalLink className="size-4" aria-hidden />
            <span className="sr-only">{t('kayitGeriBildirim.kart.yeniSekme')}</span>
          </a>
        ) : (
          <p className="text-sm text-hata">{t('kayitGeriBildirim.kayitlarim.adresGecersiz')}</p>
        )}
        {!izlendi ? (
          <Dugme
            type="button"
            gorunum="ikincil"
            disabled={izledim.isPending}
            onClick={() => {
              izledim.mutate();
            }}
          >
            {t('kayitGeriBildirim.kayitlarim.izledim')}
          </Dugme>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 text-sm text-metin-ikincil"
            role="status"
          >
            <CircleCheck className="size-4" aria-hidden />
            {t('kayitGeriBildirim.kayitlarim.izlendiIsaretli')}
          </span>
        )}
        {!sorunFormu ? (
          <Dugme
            type="button"
            gorunum="hayalet"
            onClick={() => {
              setSorunFormu(true);
            }}
          >
            {t('kayitGeriBildirim.kayitlarim.acilmiyor')}
          </Dugme>
        ) : null}
      </div>
      {izledim.isError ? <Uyari>{hataMesaji(izledim.error)}</Uyari> : null}
      {d.acik_sorun_var && !sorunFormu ? (
        <p className="text-sm text-metin-ikincil">{t('kayitGeriBildirim.kayitlarim.bildirdin')}</p>
      ) : null}
      {sorunFormu ? (
        <SorunFormu
          kurumId={kurumId}
          kaynakId={k.id}
          kapat={() => {
            setSorunFormu(false);
          }}
          bitti={() => {
            setSorunFormu(false);
            bildir(t('kayitGeriBildirim.kayitlarim.bildirildi'));
            void qc.invalidateQueries({
              queryKey: [...kayitAnahtari(kurumId), 'kayitlarim-detay'],
            });
          }}
        />
      ) : null}
    </div>
  );
}

const NEDENLER = ['acilmiyor', 'parola_yanlis', 'suresi_doldu', 'diger'] as const;

function SorunFormu({
  kurumId,
  kaynakId,
  kapat,
  bitti,
}: {
  kurumId: string;
  kaynakId: string;
  kapat: () => void;
  bitti: () => void;
}) {
  const [neden, setNeden] = useState<(typeof NEDENLER)[number]>('acilmiyor');
  const [aciklama, setAciklama] = useState('');
  const gonder = useMutation({
    mutationFn: () =>
      dersIstek(`kurumlar/${kurumId}/kayitlarim/${kaynakId}/sorunlar`, {
        govde: { neden, ...(aciklama.trim() ? { aciklama: aciklama.trim() } : {}) },
      }),
    onSuccess: bitti,
  });
  const gonderOlay = (e: SyntheticEvent) => {
    e.preventDefault();
    gonder.mutate();
  };
  return (
    <form
      onSubmit={gonderOlay}
      aria-label={t('kayitGeriBildirim.kayitlarim.sorunBaslik')}
      className="flex flex-col gap-3 rounded-orta border border-kenar bg-yuzey-ikincil/40 p-3"
    >
      <p className="text-sm font-medium">{t('kayitGeriBildirim.kayitlarim.sorunBaslik')}</p>
      <Alan etiket={t('kayitGeriBildirim.kayitlarim.neden')}>
        {(o) => (
          <Secim
            {...o}
            value={neden}
            onChange={(e) => {
              setNeden(e.target.value as typeof neden);
            }}
          >
            {NEDENLER.map((n) => (
              <option key={n} value={n}>
                {t(`kayitGeriBildirim.neden.${n}`)}
              </option>
            ))}
          </Secim>
        )}
      </Alan>
      <Alan etiket={t('kayitGeriBildirim.kayitlarim.aciklamaAlani')}>
        {(o) => (
          <Girdi
            {...o}
            maxLength={500}
            value={aciklama}
            onChange={(e) => {
              setAciklama(e.target.value);
            }}
          />
        )}
      </Alan>
      {gonder.isError ? <Uyari>{hataMesaji(gonder.error)}</Uyari> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Dugme type="button" gorunum="ikincil" onClick={kapat} disabled={gonder.isPending}>
          {t('ortak.vazgec')}
        </Dugme>
        <Dugme type="submit" disabled={gonder.isPending}>
          {gonder.isPending
            ? t('operasyon.ortak.kaydediliyor')
            : t('kayitGeriBildirim.kayitlarim.bildir')}
        </Dugme>
      </div>
    </form>
  );
}
