'use client';

import { t } from '@kopru/i18n';
import { Bell, CheckCheck, Settings } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { BildirimSatiri } from './bildirim-satiri';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { DahaFazla, ListeIskeleti } from '@/components/hesap/ortak';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Dugme, dugmeStili } from '@/components/ui/button';
import { Kart } from '@/components/ui/kart';
import { Uyari } from '@/components/ui/uyari';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import {
  useArsivle,
  useKutu,
  useOkunduIsaretle,
  useOkunmamisSayisi,
  useTumunuOku,
} from '@/lib/bildirim/veri';
import { cn } from '@/lib/cn';

export function BildirimlerEkrani() {
  const { uyelik, rol } = useKurum();
  const kurumId = uyelik.kurumId;
  const [yalnizOkunmamis, setYalnizOkunmamis] = useState(false);
  const kutu = useKutu(kurumId, yalnizOkunmamis);
  const sayiSorgusu = useOkunmamisSayisi(kurumId);
  const okundu = useOkunduIsaretle(kurumId);
  const arsivle = useArsivle(kurumId);
  const tumunu = useTumunuOku(kurumId);
  const sayi = sayiSorgusu.data?.okunmamis ?? 0;
  const ogeler = kutu.data?.pages.flatMap((s) => s.ogeler) ?? [];
  const islemHatasi = okundu.isError || arsivle.isError || tumunu.isError;

  return (
    <>
      <SayfaBasligi baslik={t('bildirim.sayfa.baslik')} aciklama={t('bildirim.sayfa.aciklama')}>
        <div className="flex flex-wrap items-center gap-2">
          <Dugme
            gorunum="ikincil"
            disabled={sayi === 0 || tumunu.isPending}
            onClick={() => {
              tumunu.mutate(undefined);
            }}
          >
            <CheckCheck aria-hidden />
            {t('bildirim.tumunuOku')}
          </Dugme>
          <Link
            href={`/${kurumId}/ayarlar/bildirimler`}
            className={dugmeStili({ gorunum: 'ikincil' })}
          >
            <Settings aria-hidden />
            {t('bildirim.sayfa.tercihler')}
          </Link>
        </div>
      </SayfaBasligi>

      <div
        role="group"
        aria-label={t('bildirim.sayfa.suzgec')}
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
            className={cn(
              'flex h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors',
              yalnizOkunmamis === okunmamis
                ? 'border-birincil bg-birincil-yumusak text-metin'
                : 'border-kenar bg-yuzey text-metin-ikincil hover:bg-yuzey-ikincil',
            )}
          >
            {okunmamis ? t('bildirim.sayfa.okunmamis') : t('bildirim.sayfa.hepsi')}
            {okunmamis && sayi > 0 ? (
              <span className="ml-2 rounded-full bg-vurgu px-1.5 text-xs font-semibold text-vurgu-uzeri">
                {sayi}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {islemHatasi ? <Uyari className="mb-4">{t('bildirim.sayfa.islemHatasi')}</Uyari> : null}

      <Kart>
        {kutu.isPending ? (
          <ListeIskeleti satir={5} />
        ) : kutu.isError ? (
          <HataDurumu
            baslik={t('bildirim.sayfa.listeHatasi')}
            aciklama={hataMesaji(kutu.error)}
            tekrarDene={() => {
              void kutu.refetch();
            }}
          />
        ) : ogeler.length === 0 ? (
          <BosDurum
            className="py-16"
            ikon={Bell}
            baslik={yalnizOkunmamis ? t('bildirim.sayfa.bosOkunmamis') : t('bildirim.bos')}
            aciklama={
              yalnizOkunmamis
                ? t('bildirim.sayfa.bosOkunmamisAciklama')
                : t('bildirim.sayfa.bosAciklama')
            }
          />
        ) : (
          <>
            <ul aria-label={t('bildirim.sayfa.baslik')}>
              {ogeler.map((oge) => (
                <BildirimSatiri
                  key={oge.id}
                  oge={oge}
                  kurumId={kurumId}
                  rol={rol}
                  tiklandi={(o) => {
                    if (o.okundu_at === null) okundu.mutate(o.id);
                  }}
                  okunduIsaretle={(id) => {
                    okundu.mutate(id);
                  }}
                  arsivle={(id) => {
                    arsivle.mutate(id);
                  }}
                />
              ))}
            </ul>
            <DahaFazla
              daha={kutu.hasNextPage}
              yukleniyor={kutu.isFetchingNextPage}
              yukle={() => {
                void kutu.fetchNextPage();
              }}
            />
          </>
        )}
      </Kart>
    </>
  );
}
