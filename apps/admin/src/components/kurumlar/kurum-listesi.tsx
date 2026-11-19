'use client';

import { t } from '@kopru/i18n';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { Alan, Secim } from '../ui/alan';
import { Dugme } from '../ui/dugme';
import { BosDurum, SorguHatasi, Yukleniyor } from '../ui/durum-gosterimi';
import { SayfaBasligi } from '../ui/kart';
import { Rozet, type RozetTonu } from '../ui/rozet';
import { Tablo, Td, Th } from '../ui/tablo';

import { platform } from '@/lib/api';
import { sahipMetni, tarih } from '@/lib/bicim';
import type { KurumDurumu, KurumListesi } from '@/lib/tipler';

export const DURUM_TONU: Record<KurumDurumu, RozetTonu> = {
  aktif: 'basari',
  askida: 'uyari',
  kapali: 'hata',
};

export function KurumListesiSayfasi() {
  const [girdi, setGirdi] = useState('');
  const [durumF, setDurumF] = useState<'' | KurumDurumu>('');
  const [sorgu, setSorgu] = useState({ q: '', durum: '' });

  const q = sorgu.q.trim();
  const kisa = girdi.trim().length === 1;
  const liste = useInfiniteQuery({
    queryKey: ['kurumlar', sorgu],
    queryFn: ({ pageParam }) =>
      platform.al<KurumListesi>('kurumlar', {
        q: q.length >= 2 ? q : undefined,
        durum: sorgu.durum || undefined,
        limit: 25,
        imlec: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (son) => son.sonraki_imlec ?? undefined,
  });

  const ara = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (kisa) return;
    setSorgu({ q: girdi, durum: durumF });
  };

  const kurumlar = liste.data?.pages.flatMap((s) => s.kurumlar) ?? [];

  return (
    <>
      <SayfaBasligi
        baslik={t('yonetim.kurumlar.baslik')}
        aciklama={t('yonetim.kurumlar.aciklama')}
      />

      <form onSubmit={ara} role="search" className="mb-5 flex flex-wrap items-end gap-3">
        <Alan
          etiket={t('yonetim.kurumlar.ara')}
          type="search"
          placeholder={t('yonetim.kurumlar.araYerTutucu')}
          value={girdi}
          onChange={(e) => {
            setGirdi(e.target.value);
          }}
          hata={kisa ? t('yonetim.kurumlar.kisaArama') : undefined}
          kapsayiciSinifi="min-w-0 flex-1 basis-64"
        />
        <Secim
          etiket={t('yonetim.kurumlar.durum')}
          value={durumF}
          onChange={(e) => {
            setDurumF(e.target.value as '' | KurumDurumu);
          }}
          kapsayiciSinifi="w-full sm:w-48"
        >
          <option value="">{t('yonetim.kurumlar.tumDurumlar')}</option>
          <option value="aktif">{t('yonetim.kurumDurum.aktif')}</option>
          <option value="askida">{t('yonetim.kurumDurum.askida')}</option>
          <option value="kapali">{t('yonetim.kurumDurum.kapali')}</option>
        </Secim>
        <Dugme type="submit" disabled={kisa}>
          {t('yonetim.kurumlar.araDugme')}
        </Dugme>
      </form>

      {liste.isPending ? (
        <Yukleniyor />
      ) : liste.error ? (
        <SorguHatasi
          hata={liste.error}
          onTekrar={() => {
            void liste.refetch();
          }}
        />
      ) : kurumlar.length === 0 ? (
        <BosDurum>{t('yonetim.kurumlar.bos')}</BosDurum>
      ) : (
        <>
          <p role="status" className="mb-2 text-sm text-metin-ikincil">
            {t('yonetim.kurumlar.sonuc', { n: kurumlar.length })}
          </p>
          <Tablo etiket={t('yonetim.kurumlar.tablo')}>
            <thead>
              <tr>
                <Th>{t('yonetim.kurumlar.sutunKurum')}</Th>
                <Th>{t('yonetim.kurumlar.sutunTur')}</Th>
                <Th>{t('yonetim.kurumlar.sutunDurum')}</Th>
                <Th>{t('yonetim.kurumlar.sutunSahip')}</Th>
                <Th>{t('yonetim.kurumlar.sutunOlusturma')}</Th>
              </tr>
            </thead>
            <tbody>
              {kurumlar.map((k) => (
                <tr key={k.id}>
                  <Td>
                    <Link
                      href={`/kurumlar/${k.id}`}
                      className="font-medium text-birincil underline-offset-2 hover:underline"
                    >
                      {k.ad}
                    </Link>
                  </Td>
                  <Td>{t(`yonetim.tur.${k.tur}`)}</Td>
                  <Td>
                    <Rozet ton={DURUM_TONU[k.durum]}>{t(`yonetim.kurumDurum.${k.durum}`)}</Rozet>
                  </Td>
                  <Td className="text-metin-ikincil">
                    {k.sahipler.map((s) => (
                      <div key={s.kullanici_id}>{sahipMetni(s)}</div>
                    ))}
                  </Td>
                  <Td className="whitespace-nowrap">{tarih(k.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Tablo>
          {liste.hasNextPage ? (
            <Dugme
              gorunum="ikincil"
              className="mt-4"
              disabled={liste.isFetchingNextPage}
              onClick={() => {
                void liste.fetchNextPage();
              }}
            >
              {t('yonetim.ortak.dahaFazla')}
            </Dugme>
          ) : null}
        </>
      )}
    </>
  );
}
