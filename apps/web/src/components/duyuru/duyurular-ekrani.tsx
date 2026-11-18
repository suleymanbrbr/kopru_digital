'use client';

import type { Duyuru, DuyuruAliciOgesi } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { Megaphone, Pin, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { DuyuruFormu, type FormSonucu } from './duyuru-formu';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import {
  BildirimKutusu,
  DahaFazla,
  ListeIskeleti,
  basari,
  type Bildirim,
} from '@/components/hesap/ortak';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Dugme } from '@/components/ui/button';
import { Kart } from '@/components/ui/kart';
import { Rozet } from '@/components/ui/rozet';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { goreliZaman } from '@/lib/bildirim/zaman';
import { cn } from '@/lib/cn';
import { duyuruHedefEtiketi } from '@/lib/duyuru/etiket';
import { useDuyuruYonetimi, useDuyurularim } from '@/lib/duyuru/veri';
import { useGruplar } from '@/lib/operasyon-verisi';
import { izinli } from '@/lib/yetki';

type Gorunum = 'gelen' | 'yonetim';

const SUZGEC_DUGMESI =
  'flex h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors';
const secili = 'border-birincil bg-birincil-yumusak text-metin';
const secilmemis = 'border-kenar bg-yuzey text-metin-ikincil hover:bg-yuzey-ikincil';

export function DuyurularEkrani() {
  return (
    <BolumKapisi bolum="duyurular">
      <DuyurularIcerigi />
    </BolumKapisi>
  );
}

function DuyurularIcerigi() {
  const { uyelik, rol } = useKurum();
  const yazabilir = izinli(rol, 'duyuru.yaz');
  const [gorunum, setGorunum] = useState<Gorunum>('gelen');
  const [formAcik, setFormAcik] = useState(false);
  const [bildirim, setBildirim] = useState<Bildirim>(null);

  const sonuc = (s: FormSonucu) => {
    setFormAcik(false);
    if (s.tur === 'taslak') {
      setBildirim(basari(t('duyurular.eylem.taslakKaydedildi')));
    } else {
      setBildirim(
        basari(
          s.duyuru.alici_sayisi > 0
            ? t('duyurular.onay.sonuc', { n: s.duyuru.alici_sayisi })
            : t('duyurular.onay.sonucKisisiz'),
        ),
      );
    }
    setGorunum('yonetim');
  };

  return (
    <>
      <SayfaBasligi baslik={t('duyurular.baslik')} aciklama={t('duyurular.aciklama')}>
        {yazabilir ? (
          <Dugme
            onClick={() => {
              setFormAcik(true);
            }}
          >
            <Plus aria-hidden />
            {t('duyurular.yeni')}
          </Dugme>
        ) : null}
      </SayfaBasligi>

      {yazabilir ? (
        <div
          role="group"
          aria-label={t('duyurular.gorunum')}
          className="mb-4 flex flex-wrap items-center gap-2"
        >
          {(['gelen', 'yonetim'] as const).map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={gorunum === g}
              onClick={() => {
                setGorunum(g);
              }}
              className={cn(SUZGEC_DUGMESI, gorunum === g ? secili : secilmemis)}
            >
              {t(`duyurular.${g}`)}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mb-4">
        <BildirimKutusu bildirim={bildirim} />
      </div>

      {gorunum === 'gelen' || !yazabilir ? (
        <GelenListesi kurumId={uyelik.kurumId} />
      ) : (
        <YonetimListesi kurumId={uyelik.kurumId} />
      )}

      {yazabilir ? (
        <DuyuruFormu
          acik={formAcik}
          kapat={() => {
            setFormAcik(false);
          }}
          tamam={sonuc}
        />
      ) : null}
    </>
  );
}

// --- Gelen (alici) ---------------------------------------------------------------------------------

function GelenListesi({ kurumId }: { kurumId: string }) {
  const [yalnizOkunmamis, setYalnizOkunmamis] = useState(false);
  const sorgu = useDuyurularim(kurumId, yalnizOkunmamis);
  const ogeler = sorgu.data?.pages.flatMap((s) => s.ogeler) ?? [];
  const sabitler = ogeler.filter((o) => o.sabit);
  const digerleri = ogeler.filter((o) => !o.sabit);

  return (
    <>
      <div
        role="group"
        aria-label={t('duyurular.suzgec')}
        className="mb-4 flex flex-wrap items-center gap-2"
      >
        {([false, true] as const).map((okunmamis) => (
          <button
            key={String(okunmamis)}
            type="button"
            aria-pressed={yalnizOkunmamis === okunmamis}
            onClick={() => {
              setYalnizOkunmamis(okunmamis);
            }}
            className={cn(SUZGEC_DUGMESI, yalnizOkunmamis === okunmamis ? secili : secilmemis)}
          >
            {okunmamis ? t('duyurular.okunmamis') : t('duyurular.hepsi')}
          </button>
        ))}
      </div>

      <Kart aria-label={t('duyurular.baslik')}>
        {sorgu.isPending ? (
          <ListeIskeleti satir={4} />
        ) : sorgu.isError ? (
          <HataDurumu
            baslik={t('duyurular.listeHatasi')}
            aciklama={hataMesaji(sorgu.error)}
            tekrarDene={() => void sorgu.refetch()}
          />
        ) : ogeler.length === 0 ? (
          <BosDurum
            className="py-16"
            ikon={Megaphone}
            baslik={yalnizOkunmamis ? t('duyurular.bosOkunmamis') : t('duyurular.bos')}
            aciklama={
              yalnizOkunmamis ? t('duyurular.bosOkunmamisAciklama') : t('duyurular.bosAciklama')
            }
          />
        ) : (
          <>
            {sabitler.length > 0 ? (
              <DuyuruBolumu
                baslik={t('duyurular.sabitlenenler')}
                ogeler={sabitler}
                kurumId={kurumId}
              />
            ) : null}
            {digerleri.length > 0 ? (
              <DuyuruBolumu
                baslik={sabitler.length > 0 ? t('duyurular.digerleri') : undefined}
                ogeler={digerleri}
                kurumId={kurumId}
              />
            ) : null}
            <DahaFazla
              daha={sorgu.hasNextPage}
              yukleniyor={sorgu.isFetchingNextPage}
              yukle={() => void sorgu.fetchNextPage()}
            />
          </>
        )}
      </Kart>
    </>
  );
}

function DuyuruBolumu({
  baslik,
  ogeler,
  kurumId,
}: {
  baslik?: string | undefined;
  ogeler: readonly DuyuruAliciOgesi[];
  kurumId: string;
}) {
  return (
    <section aria-label={baslik}>
      {baslik ? (
        <h2 className="border-b border-kenar bg-yuzey-ikincil/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-metin-ikincil">
          {baslik}
        </h2>
      ) : null}
      <ul>
        {ogeler.map((o) => (
          <DuyuruSatiri key={o.id} oge={o} kurumId={kurumId} />
        ))}
      </ul>
    </section>
  );
}

export function DuyuruSatiri({ oge, kurumId }: { oge: DuyuruAliciOgesi; kurumId: string }) {
  const okunmamis = oge.okundu_at === null;
  return (
    <li
      data-testid="duyuru-satiri"
      data-okunmamis={okunmamis ? 'true' : 'false'}
      data-sabit={oge.sabit ? 'true' : 'false'}
      className={cn(
        'border-b border-kenar last:border-b-0',
        okunmamis ? 'bg-birincil-yumusak/40' : undefined,
      )}
    >
      <Link
        href={`/${kurumId}/duyurular/${oge.id}`}
        className="flex min-w-0 items-start gap-3 px-4 py-3 hover:bg-yuzey-ikincil"
      >
        <span
          aria-hidden
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-yuzey-ikincil text-metin-ikincil"
        >
          {oge.sabit ? (
            <Pin className="size-[1.125rem]" />
          ) : (
            <Megaphone className="size-[1.125rem]" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-sm',
                okunmamis ? 'font-semibold' : 'font-medium',
              )}
            >
              {oge.baslik}
            </span>
            {oge.sabit ? <Rozet>{t('duyurular.sabit')}</Rozet> : null}
            {okunmamis ? (
              <>
                <span aria-hidden className="size-2 shrink-0 rounded-full bg-birincil" />
                <span className="sr-only">{t('duyurular.okunmamisIsareti')}</span>
              </>
            ) : null}
          </span>
          <span className="mt-0.5 line-clamp-2 block text-sm text-metin-ikincil">{oge.govde}</span>
          <span className="mt-1 block text-xs text-metin-ikincil">
            <time dateTime={oge.yayin_at}>{goreliZaman(oge.yayin_at)}</time>
          </span>
        </span>
      </Link>
    </li>
  );
}

// --- Yonetim (yazar) -----------------------------------------------------------------------------------

const DURUM_TONU = { taslak: 'notr', yayinda: 'basari', arsiv: 'uyari' } as const;

function YonetimListesi({ kurumId }: { kurumId: string }) {
  const sorgu = useDuyuruYonetimi(kurumId, undefined, true);
  const gruplar = useGruplar(kurumId);
  const ogeler = sorgu.data?.pages.flatMap((s) => s.ogeler) ?? [];

  return (
    <Kart aria-label={t('duyurular.yonetim')}>
      {sorgu.isPending ? (
        <ListeIskeleti satir={4} />
      ) : sorgu.isError ? (
        <HataDurumu
          baslik={t('duyurular.listeHatasi')}
          aciklama={hataMesaji(sorgu.error)}
          tekrarDene={() => void sorgu.refetch()}
        />
      ) : ogeler.length === 0 ? (
        <BosDurum
          className="py-16"
          ikon={Megaphone}
          baslik={t('duyurular.bosYonetim')}
          aciklama={t('duyurular.bosYonetimAciklama')}
        />
      ) : (
        <>
          <ul>
            {ogeler.map((d) => (
              <YonetimSatiri key={d.id} duyuru={d} kurumId={kurumId} grupAdlari={gruplar.adlar} />
            ))}
          </ul>
          <DahaFazla
            daha={sorgu.hasNextPage}
            yukleniyor={sorgu.isFetchingNextPage}
            yukle={() => void sorgu.fetchNextPage()}
          />
        </>
      )}
    </Kart>
  );
}

function YonetimSatiri({
  duyuru: d,
  kurumId,
  grupAdlari,
}: {
  duyuru: Duyuru;
  kurumId: string;
  grupAdlari: ReadonlyMap<string, { etiket: string }>;
}) {
  const zaman = d.yayin_at ?? d.created_at;
  return (
    <li data-testid="duyuru-yonetim-satiri" className="border-b border-kenar last:border-b-0">
      <Link
        href={`/${kurumId}/duyurular/${d.id}`}
        className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-yuzey-ikincil"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="min-w-0 truncate text-sm font-medium">{d.baslik}</span>
            {d.sabit ? <Rozet>{t('duyurular.sabit')}</Rozet> : null}
          </span>
          <span className="mt-0.5 block text-xs text-metin-ikincil">
            {duyuruHedefEtiketi(d, grupAdlari)} · <time dateTime={zaman}>{goreliZaman(zaman)}</time>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {d.durum === 'yayinda' || d.durum === 'arsiv' ? (
            <span className="text-sm tabular-nums text-metin-ikincil" data-testid="duyuru-okunan">
              {t('duyurular.okunanSatir', { okunan: d.okunan_sayisi, alici: d.alici_sayisi })}
            </span>
          ) : null}
          <Rozet ton={DURUM_TONU[d.durum]}>{t(`bildirim.duyuru.durum.${d.durum}`)}</Rozet>
        </span>
      </Link>
    </li>
  );
}
