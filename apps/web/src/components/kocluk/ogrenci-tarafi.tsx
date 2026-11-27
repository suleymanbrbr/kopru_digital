'use client';

import type { KaynakOnerisi, OgrenciDegerlendirme } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { ExternalLink, MessageSquareText, NotebookPen } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { DahaFazla, tarihYaz } from '@/components/hesap/ortak';
import { dugmeStili } from '@/components/ui/button';
import { Iskelet, Kart } from '@/components/ui/kart';
import { Rozet } from '@/components/ui/rozet';
import { useKurum } from '@/kurum/baglam';
import { bransAdi } from '@/lib/bransler';
import {
  OLCEKLER,
  donemEtiketi,
  guvenliBaglanti,
  olcekAdi,
  oneriBasligi,
  oneridenKayitSorgusu,
} from '@/lib/degerlendirme/model';
import { useDegerlendirmelerim, useKaynakOnerilerim } from '@/lib/degerlendirme/veri';

/**
 * Öğrenci "Soru takibim > Öğretmenim" sekmesi: öğretmenlerinin önerdiği kaynaklar (tek tıkla "Soru çözdüm"
 * formunda kaynak olarak ön seçilir) ve kendisine görünür işaretlenmiş değerlendirmeler. Görünür olmayan
 * hiçbir değerlendirme bu uçlardan gelmez (api sözleşmesi ve veritabanı RLS'i).
 */
export function OgretmenimSekmesi() {
  return (
    <div className="flex flex-col gap-6" data-testid="ogretmenim">
      <OnerilenlerBolumu />
      <DegerlendirmelerBolumu />
    </div>
  );
}

function Bolum({
  id,
  baslik,
  aciklama,
  children,
}: {
  id: string;
  baslik: string;
  aciklama: string;
  children: ReactNode;
}) {
  return (
    <Kart aria-labelledby={id} className="flex flex-col">
      <div className="border-b border-kenar px-5 py-4">
        <h2 id={id} className="text-base font-semibold">
          {baslik}
        </h2>
        <p className="mt-0.5 text-sm text-metin-ikincil">{aciklama}</p>
      </div>
      {children}
    </Kart>
  );
}

function Yukleniyor() {
  return (
    <div role="status" aria-label={t('ortak.yukleniyor')} className="flex flex-col gap-3 p-5">
      <Iskelet className="h-5 w-3/4" />
      <Iskelet className="h-5 w-1/2" />
    </div>
  );
}

function OnerilenlerBolumu() {
  const { uyelik } = useKurum();
  const q = useKaynakOnerilerim(uyelik.kurumId);
  return (
    <Bolum
      id="ogretmenim-oneriler"
      baslik={t('kaynakOnerisi.ogrenci.baslik')}
      aciklama={t('kaynakOnerisi.ogrenci.aciklama')}
    >
      {q.isPending ? (
        <Yukleniyor />
      ) : q.isError ? (
        <HataDurumu tekrarDene={() => void q.refetch()} className="py-8" />
      ) : q.data.oneriler.length === 0 ? (
        <BosDurum
          ikon={NotebookPen}
          baslik={t('kaynakOnerisi.ogrenci.bos')}
          aciklama={t('kaynakOnerisi.ogrenci.bosAciklama')}
        />
      ) : (
        <ul className="divide-y divide-kenar" data-testid="oneri-listesi">
          {q.data.oneriler.map((o) => (
            <OneriSatiri key={o.id} oneri={o} kok={`/${uyelik.kurumId}`} />
          ))}
        </ul>
      )}
    </Bolum>
  );
}

function OneriSatiri({ oneri: o, kok }: { oneri: KaynakOnerisi; kok: string }) {
  const sorgu = oneridenKayitSorgusu(o);
  const adres = guvenliBaglanti(o.baglanti_url);
  return (
    <li data-testid="oneri-satiri" className="flex flex-col gap-1.5 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{oneriBasligi(o)}</span>
        <Rozet ton="notr">{t(`kaynakOnerisi.tur.${o.tur}`)}</Rozet>
        {o.basladi ? <Rozet ton="basari">{t('kaynakOnerisi.basladi')}</Rozet> : null}
      </div>
      <p className="text-sm text-metin-ikincil">
        {o.oneren_ad
          ? t('kaynakOnerisi.ogrenci.onerenAd', { ad: o.oneren_ad, tarih: tarihYaz(o.created_at) })
          : t('kaynakOnerisi.ogrenci.onerenYok', { tarih: tarihYaz(o.created_at) })}
        {o.brans_kodu ? ` · ${bransAdi(o.brans_kodu)}` : ''}
        {o.konu_ad ? ` · ${t('kaynakOnerisi.liste.konu', { konu: o.konu_ad })}` : ''}
      </p>
      {o.not ? <p className="whitespace-pre-line text-sm">{o.not}</p> : null}
      <div className="mt-1 flex flex-wrap gap-2">
        {sorgu ? (
          <Link
            href={`${kok}/soru-cozdum?${sorgu}`}
            className={dugmeStili({ gorunum: 'ikincil', boyut: 'sm' })}
          >
            {t('kaynakOnerisi.gunlukKayitta')}
          </Link>
        ) : null}
        {adres ? (
          <a
            href={adres}
            target="_blank"
            rel="noopener noreferrer"
            className={dugmeStili({ gorunum: 'ikincil', boyut: 'sm' })}
          >
            <ExternalLink aria-hidden />
            {t('kaynakOnerisi.liste.linkAc')}
          </a>
        ) : null}
      </div>
    </li>
  );
}

function DegerlendirmelerBolumu() {
  const { uyelik } = useKurum();
  const q = useDegerlendirmelerim(uyelik.kurumId);
  const liste: OgrenciDegerlendirme[] = q.data?.pages.flatMap((s) => s.degerlendirmeler) ?? [];
  return (
    <Bolum
      id="ogretmenim-degerlendirmeler"
      baslik={t('kocluk.ogrenci.degerlendirmeBaslik')}
      aciklama={t('kocluk.ogrenci.degerlendirmeAciklama')}
    >
      {q.isPending ? (
        <Yukleniyor />
      ) : q.isError ? (
        <HataDurumu tekrarDene={() => void q.refetch()} className="py-8" />
      ) : liste.length === 0 ? (
        <BosDurum
          ikon={MessageSquareText}
          baslik={t('kocluk.ogrenci.degerlendirmeBos')}
          aciklama={t('kocluk.ogrenci.degerlendirmeBosAciklama')}
        />
      ) : (
        <>
          <ul className="divide-y divide-kenar" data-testid="degerlendirme-listesi">
            {liste.map((d) => (
              <li
                key={d.id}
                data-testid="degerlendirme-satiri"
                className="flex flex-col gap-2 px-5 py-4"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{d.yazar_ad ?? t('kocluk.ogrenci.yazarYok')}</span>
                  <span className="text-sm text-metin-ikincil">
                    {donemEtiketi(d.donem_baslangic, d.donem_bitis)}
                  </span>
                  {d.brans_kodu ? <Rozet ton="notr">{bransAdi(d.brans_kodu)}</Rozet> : null}
                </div>
                {OLCEKLER.some((o) => d[o] !== null) ? (
                  <ul
                    className="flex flex-wrap gap-2"
                    aria-label={t('degerlendirme.form.olcekler')}
                  >
                    {OLCEKLER.filter((o) => d[o] !== null).map((o) => (
                      <li key={o}>
                        <Rozet ton="bilgi" className="text-sm">
                          {t('kocluk.zaman.olcekDegeri', { olcek: olcekAdi(o), puan: d[o] ?? 0 })}
                        </Rozet>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {d.yorum ? <p className="whitespace-pre-line text-sm">{d.yorum}</p> : null}
              </li>
            ))}
          </ul>
          <DahaFazla
            daha={q.hasNextPage}
            yukleniyor={q.isFetchingNextPage}
            yukle={() => void q.fetchNextPage()}
          />
        </>
      )}
    </Bolum>
  );
}
