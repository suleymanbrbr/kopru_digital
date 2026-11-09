'use client';

import { BakiyeHareketListeYanitSema, KrediHareketListeYanitSema } from '@kopru/contracts';
import { kurusBicimle, t } from '@kopru/i18n';
import { useState } from 'react';

import { finansAnahtari } from './finans-verisi';

import { HataDurumu } from '@/components/hata-durumu';
import { DahaFazla, ListeIskeleti, tarihYaz } from '@/components/hesap/ortak';
import { Dugme } from '@/components/ui/button';
import { Pencere } from '@/components/ui/pencere';
import { hataMesaji } from '@/lib/api';
import { useSayfaliSorgu } from '@/lib/sayfali-sorgu';

const secili = 'border-birincil bg-birincil-yumusak';

type Tur = 'kredi' | 'bakiye';

/** Ayri sayfali defter gorunumu: ders (kredi) ve para (bakiye) hareketleri, yeniden eskiye. */
export function DefterPenceresi({
  acik,
  degisti,
  kurumId,
  ogrenciId,
}: {
  acik: boolean;
  degisti: (acik: boolean) => void;
  kurumId: string;
  ogrenciId: string;
}) {
  return (
    <Pencere acik={acik} degisti={degisti} genis baslik={t('operasyon.finans.kart.defterBaslik')}>
      <Icerik kurumId={kurumId} ogrenciId={ogrenciId} />
    </Pencere>
  );
}

function Icerik({ kurumId, ogrenciId }: { kurumId: string; ogrenciId: string }) {
  const [tur, setTur] = useState<Tur>('kredi');
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={t('operasyon.finans.kart.defter')} className="flex gap-2">
        {(['kredi', 'bakiye'] as const).map((x) => (
          <Dugme
            key={x}
            boyut="sm"
            gorunum="ikincil"
            className={tur === x ? secili : undefined}
            aria-pressed={tur === x}
            onClick={() => {
              setTur(x);
            }}
          >
            {x === 'kredi'
              ? t('operasyon.finans.kart.krediHareketleri')
              : t('operasyon.finans.kart.bakiyeHareketleri')}
          </Dugme>
        ))}
      </div>
      {tur === 'kredi' ? (
        <KrediDefteri kurumId={kurumId} ogrenciId={ogrenciId} />
      ) : (
        <BakiyeDefteri kurumId={kurumId} ogrenciId={ogrenciId} />
      )}
    </div>
  );
}

function Liste({
  q,
  satirlar,
}: {
  q: {
    isPending: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => unknown;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => unknown;
  };
  satirlar: { id: string; ad: string; deger: string; tarih: string; neden: string | null }[];
}) {
  if (q.isPending) return <ListeIskeleti />;
  if (q.isError) {
    return (
      <HataDurumu
        aciklama={hataMesaji(q.error)}
        tekrarDene={() => void q.refetch()}
        className="py-6"
      />
    );
  }
  if (satirlar.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-metin-ikincil">
        {t('operasyon.finans.kart.hareketBos')}
      </p>
    );
  }
  return (
    <>
      <ul className="divide-y divide-kenar rounded-orta border border-kenar">
        {satirlar.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{s.ad}</p>
              <p className="text-xs text-metin-ikincil">
                {tarihYaz(s.tarih)}
                {s.neden ? ` · ${s.neden}` : ''}
              </p>
            </div>
            <p className="text-sm font-semibold tabular-nums">{s.deger}</p>
          </li>
        ))}
      </ul>
      <DahaFazla
        daha={q.hasNextPage}
        yukleniyor={q.isFetchingNextPage}
        yukle={() => void q.fetchNextPage()}
      />
    </>
  );
}

function KrediDefteri({ kurumId, ogrenciId }: { kurumId: string; ogrenciId: string }) {
  const q = useSayfaliSorgu({
    servis: 'finans',
    anahtar: [...finansAnahtari(kurumId), 'defter-kredi', ogrenciId],
    yol: `kurumlar/${kurumId}/ogrenciler/${ogrenciId}/kredi-hareketleri`,
    sema: KrediHareketListeYanitSema,
    sayfaBoyutu: 20,
  });
  const satirlar = (q.data?.pages.flatMap((s) => s.hareketler) ?? []).map((h) => ({
    id: h.id,
    ad: t(`operasyon.finans.kredi.${h.tur}`),
    deger: t('operasyon.finans.kredi.miktar', {
      isaret: h.miktar > 0 ? '+' : '',
      sayi: h.miktar,
    }),
    tarih: h.created_at,
    neden: h.neden,
  }));
  return <Liste q={q} satirlar={satirlar} />;
}

function BakiyeDefteri({ kurumId, ogrenciId }: { kurumId: string; ogrenciId: string }) {
  const q = useSayfaliSorgu({
    servis: 'finans',
    anahtar: [...finansAnahtari(kurumId), 'defter-bakiye', ogrenciId],
    yol: `kurumlar/${kurumId}/ogrenciler/${ogrenciId}/bakiye-hareketleri`,
    sema: BakiyeHareketListeYanitSema,
    sayfaBoyutu: 20,
  });
  const satirlar = (q.data?.pages.flatMap((s) => s.hareketler) ?? []).map((h) => ({
    id: h.id,
    ad: t(`operasyon.finans.bakiyeTur.${h.tur}`),
    deger: kurusBicimle(h.tutar_kurus),
    tarih: h.created_at,
    neden: h.neden,
  }));
  return <Liste q={q} satirlar={satirlar} />;
}
