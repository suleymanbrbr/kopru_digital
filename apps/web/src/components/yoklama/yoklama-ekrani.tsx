'use client';

import { YoklamaBekleyenYanitSema } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { ClipboardCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { YoklamaFormu } from './yoklama-formu';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { BildirimKutusu, DahaFazla, ListeIskeleti, type Bildirim } from '@/components/hesap/ortak';
import { BolumKapisi } from '@/components/kabuk/bolum-yer-tutucu';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { dersAnahtari } from '@/components/takvim/ders-verisi';
import { Dugme, dugmeStili } from '@/components/ui/button';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { useGruplar, useSaatDilimi } from '@/lib/operasyon-verisi';
import { gunEtiketi, saatAraligi, yerelTarih } from '@/lib/saat';
import { useSayfaliSorgu } from '@/lib/sayfali-sorgu';

export function useYoklamaBekleyen(kurumId: string, etkin = true) {
  const sorgu = useSayfaliSorgu({
    servis: 'ders',
    anahtar: [...dersAnahtari(kurumId), 'bekleyen'],
    yol: `kurumlar/${kurumId}/yoklama-bekleyen`,
    sema: YoklamaBekleyenYanitSema,
    sayfaBoyutu: 50,
    etkin,
  });
  return { ...sorgu, dersler: sorgu.data?.pages.flatMap((s) => s.dersler) ?? [] };
}

export function YoklamaEkrani() {
  return (
    <BolumKapisi bolum="yoklama">
      <YoklamaIcerigi />
    </BolumKapisi>
  );
}

function YoklamaIcerigi() {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const { saatDilimi } = useSaatDilimi(kurumId);
  const gruplar = useGruplar(kurumId);
  const veri = useYoklamaBekleyen(kurumId);
  const [acik, setAcik] = useState<string | null>(null);
  const [bildirim, setBildirim] = useState<Bildirim>(null);

  return (
    <>
      <SayfaBasligi
        baslik={t('operasyon.yoklama.baslik')}
        aciklama={t('operasyon.yoklama.aciklama')}
      />
      <BildirimKutusu bildirim={bildirim} />
      <section
        aria-label={t('operasyon.yoklama.baslik')}
        className="mt-4 rounded-buyuk border border-kenar bg-yuzey"
      >
        {veri.isPending ? (
          <ListeIskeleti />
        ) : veri.isError ? (
          <HataDurumu
            baslik={t('operasyon.yoklama.yuklenemedi')}
            aciklama={hataMesaji(veri.error)}
            tekrarDene={() => void veri.refetch()}
          />
        ) : veri.dersler.length === 0 ? (
          <BosDurum
            className="py-14"
            ikon={ClipboardCheck}
            baslik={t('operasyon.yoklama.bos')}
            aciklama={t('operasyon.yoklama.bosAciklama')}
          >
            <Link href={`/${kurumId}/takvim`} className={dugmeStili({ gorunum: 'ikincil' })}>
              {t('operasyon.yoklama.bosEylem')}
            </Link>
          </BosDurum>
        ) : (
          <>
            <ul className="divide-y divide-kenar">
              {veri.dersler.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {gruplar.adlar.get(d.grup_id)?.etiket ?? '-'}
                    </p>
                    <p className="text-sm text-metin-ikincil">
                      {gunEtiketi(yerelTarih(d.baslangic_at, saatDilimi))},{' '}
                      {saatAraligi(d.baslangic_at, d.bitis_at, saatDilimi)} ·{' '}
                      {t('operasyon.yoklama.eksik', { sayi: d.yoklamasi_eksik_sayisi })}
                    </p>
                  </div>
                  <Dugme
                    onClick={() => {
                      setAcik(d.id);
                    }}
                  >
                    {t('operasyon.yoklama.yoklamaAl')}
                  </Dugme>
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
      <YoklamaFormu
        kurumId={kurumId}
        dersId={acik}
        saatDilimi={saatDilimi}
        grupAdlari={gruplar.adlar}
        kapat={() => {
          setAcik(null);
        }}
        bildir={setBildirim}
      />
    </>
  );
}
