'use client';

import { kurusBicimle, t } from '@kopru/i18n';
import { ChevronRight, Search, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { FinansAyarlari } from './finans-ayarlari';
import { useFinansOgrencileri } from './finans-verisi';
import { KrediRozeti } from './kredi-rozeti';

import { DahaFazla, ListeIskeleti } from '@/components/hesap/ortak';
import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Dugme } from '@/components/ui/button';
import { Girdi } from '@/components/ui/input';
import { Rozet } from '@/components/ui/rozet';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { cn } from '@/lib/cn';

type Suzgec = 'tumu' | 'borclu' | 'dusuk';
const SUZGECLER: readonly Suzgec[] = ['tumu', 'borclu', 'dusuk'];

export function FinansEkrani() {
  return (
    <BolumKapisi bolum="finans">
      <FinansIcerigi />
    </BolumKapisi>
  );
}

function FinansIcerigi() {
  const { rol } = useKurum();
  const yonetim = rol === 'sahip' || rol === 'yonetici';
  const [sekme, setSekme] = useState<'ogrenciler' | 'ayarlar'>('ogrenciler');

  return (
    <>
      <SayfaBasligi baslik={t('nav.finans')} aciklama={t('operasyon.finans.aciklama')} />
      {yonetim ? (
        <div role="group" aria-label={t('nav.finans')} className="mb-4 flex gap-2">
          {(['ogrenciler', 'ayarlar'] as const).map((s) => (
            <Dugme
              key={s}
              gorunum={sekme === s ? 'birincil' : 'ikincil'}
              aria-pressed={sekme === s}
              onClick={() => {
                setSekme(s);
              }}
            >
              {t(`operasyon.finans.${s}`)}
            </Dugme>
          ))}
        </div>
      ) : null}
      {sekme === 'ayarlar' && yonetim ? <FinansAyarlari /> : <OgrenciListesi />}
    </>
  );
}

function OgrenciListesi() {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const [arama, setArama] = useState('');
  const [q, setQ] = useState('');
  const [suzgec, setSuzgec] = useState<Suzgec>('tumu');

  // Arama kutusu 300 ms sonra sorguya yansir.
  useEffect(() => {
    const z = setTimeout(() => {
      setQ(arama);
    }, 300);
    return () => {
      clearTimeout(z);
    };
  }, [arama]);

  const veri = useFinansOgrencileri({
    kurumId,
    q,
    borclu: suzgec === 'borclu',
    dusukKredi: suzgec === 'dusuk',
  });
  const suzulmus = q.trim() !== '' || suzgec !== 'tumu';

  return (
    <section
      aria-label={t('operasyon.finans.ogrenciler')}
      className="rounded-buyuk border border-kenar bg-yuzey"
    >
      <div className="flex flex-col gap-3 border-b border-kenar p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <label htmlFor="finans-ara" className="sr-only">
            {t('operasyon.finans.arama')}
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-metin-ikincil"
            aria-hidden
          />
          <Girdi
            id="finans-ara"
            type="search"
            className="pl-9"
            placeholder={t('operasyon.finans.ara')}
            value={arama}
            onChange={(e) => {
              setArama(e.target.value);
            }}
          />
        </div>
        <div role="group" aria-label={t('operasyon.finans.suzgec.etiket')} className="flex gap-2">
          {SUZGECLER.map((s) => (
            <Dugme
              key={s}
              boyut="sm"
              gorunum={suzgec === s ? 'birincil' : 'ikincil'}
              aria-pressed={suzgec === s}
              onClick={() => {
                setSuzgec(s);
              }}
            >
              {t(`operasyon.finans.suzgec.${s}`)}
            </Dugme>
          ))}
        </div>
      </div>

      {veri.isPending ? (
        <ListeIskeleti satir={5} />
      ) : veri.isError ? (
        <HataDurumu
          baslik={t('operasyon.finans.yuklenemedi')}
          aciklama={hataMesaji(veri.error)}
          tekrarDene={() => void veri.refetch()}
        />
      ) : veri.ogrenciler.length === 0 ? (
        <BosDurum
          className="py-14"
          ikon={Wallet}
          baslik={suzulmus ? t('operasyon.finans.bosSuzgec') : t('operasyon.finans.bos')}
          aciklama={
            suzulmus ? t('operasyon.finans.bosSuzgecAciklama') : t('operasyon.finans.bosAciklama')
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-kenar">
            {veri.ogrenciler.map((o) => (
              <li key={o.ogrenci_id}>
                <Link
                  href={`/${kurumId}/finans/ogrenci/${o.ogrenci_id}`}
                  className={cn(
                    'flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-yuzey-ikincil',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {o.gorunen_ad ?? t('operasyon.ortak.adsiz')}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <KrediRozeti model={o.model} kalan={o.kalan_kredi} esik={veri.esik} />
                    {o.borclu ? (
                      <Rozet ton="hata">
                        {t('operasyon.finans.borcEtiket', { tutar: kurusBicimle(-o.bakiye_kurus) })}
                      </Rozet>
                    ) : null}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-metin-ikincil" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <DahaFazla
            daha={veri.hasNextPage}
            yukleniyor={veri.isFetchingNextPage}
            yukle={() => void veri.fetchNextPage()}
          />
        </>
      )}
    </section>
  );
}
