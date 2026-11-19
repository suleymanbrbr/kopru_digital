'use client';

import { t } from '@kopru/i18n';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

import { Dugme } from '../ui/dugme';
import { SorguHatasi, Yukleniyor } from '../ui/durum-gosterimi';
import { Kart, KartBasligi, SayfaBasligi } from '../ui/kart';
import { Rozet } from '../ui/rozet';
import { Tablo, Td, Th } from '../ui/tablo';

import { platform } from '@/lib/api';
import { tarihSaat } from '@/lib/bicim';
import type { SistemSagligi } from '@/lib/tipler';

/** Saniyeyi okunur sureye cevirir (sn / dk / sa). */
export function sureMetni(sn: number): string {
  if (sn < 60) return t('yonetim.saglik.saniye', { n: sn });
  if (sn < 3600) return t('yonetim.saglik.dakika', { n: Math.floor(sn / 60) });
  return t('yonetim.saglik.saat', { n: Math.floor(sn / 3600) });
}

function Olcu({
  etiket,
  deger,
  ton,
}: {
  etiket: string;
  deger: ReactNode;
  ton?: 'hata' | 'uyari';
}) {
  return (
    <div className="rounded-orta bg-yuzey-ikincil p-3">
      <dt className="text-xs text-metin-ikincil">{etiket}</dt>
      <dd
        className={
          ton === 'hata'
            ? 'mt-1 text-xl font-semibold text-hata'
            : ton === 'uyari'
              ? 'mt-1 text-xl font-semibold text-uyari'
              : 'mt-1 text-xl font-semibold'
        }
      >
        {deger}
      </dd>
    </div>
  );
}

export function SaglikSayfasi() {
  const sorgu = useQuery({
    queryKey: ['saglik'],
    queryFn: () => platform.al<SistemSagligi>('sistem-sagligi'),
    refetchInterval: 30_000,
  });

  const yenile = (
    <Dugme
      gorunum="ikincil"
      disabled={sorgu.isFetching}
      onClick={() => {
        void sorgu.refetch();
      }}
    >
      <RefreshCw aria-hidden />
      {t('yonetim.ortak.yenile')}
    </Dugme>
  );

  return (
    <>
      <SayfaBasligi
        baslik={t('yonetim.saglik.baslik')}
        aciklama={t('yonetim.saglik.aciklama')}
        sag={yenile}
      />
      {sorgu.isPending ? (
        <Yukleniyor />
      ) : sorgu.error ? (
        <SorguHatasi
          hata={sorgu.error}
          onTekrar={() => {
            void sorgu.refetch();
          }}
        />
      ) : (
        <SaglikIcerigi veri={sorgu.data} />
      )}
    </>
  );
}

function SaglikIcerigi({ veri }: { veri: SistemSagligi }) {
  const { outbox, kuyruklar, http } = veri;
  const saglikli = outbox.hatali === 0 && kuyruklar.basarisiz === 0 && http.hata_5xx === 0;
  return (
    <div className="flex flex-col gap-4">
      <p className="flex flex-wrap items-center gap-2 text-sm text-metin-ikincil">
        <Rozet ton={saglikli ? 'basari' : 'uyari'}>
          {saglikli ? t('yonetim.saglik.saglikli') : t('yonetim.saglik.dikkat')}
        </Rozet>
        {t('yonetim.saglik.uretildi', { zaman: tarihSaat(veri.uretildi_at) })} ·{' '}
        {t('yonetim.saglik.otomatik')}
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        <Kart aria-labelledby="outbox-baslik">
          <KartBasligi id="outbox-baslik" baslik={t('yonetim.saglik.outbox')} />
          <dl className="grid grid-cols-1 gap-2">
            <Olcu etiket={t('yonetim.saglik.bekleyen')} deger={outbox.bekleyen} />
            <Olcu
              etiket={t('yonetim.saglik.enEski')}
              deger={outbox.en_eski_yas_sn === null ? '—' : sureMetni(outbox.en_eski_yas_sn)}
            />
            <Olcu
              etiket={t('yonetim.saglik.hatali')}
              deger={outbox.hatali}
              {...(outbox.hatali > 0 ? { ton: 'hata' as const } : {})}
            />
          </dl>
        </Kart>

        <Kart aria-labelledby="kuyruk-baslik">
          <KartBasligi id="kuyruk-baslik" baslik={t('yonetim.saglik.kuyruklar')} />
          <dl className="grid grid-cols-1 gap-2">
            <Olcu
              etiket={t('yonetim.saglik.pgbossKurulu')}
              deger={
                kuyruklar.pgboss_kurulu
                  ? t('yonetim.saglik.kurulu')
                  : t('yonetim.saglik.kurulDegil')
              }
              {...(kuyruklar.pgboss_kurulu ? {} : { ton: 'uyari' as const })}
            />
            <Olcu
              etiket={t('yonetim.saglik.basarisiz')}
              deger={kuyruklar.basarisiz}
              {...(kuyruklar.basarisiz > 0 ? { ton: 'hata' as const } : {})}
            />
          </dl>
        </Kart>

        <Kart aria-labelledby="http-baslik">
          <KartBasligi
            id="http-baslik"
            baslik={t('yonetim.saglik.http')}
            aciklama={t('yonetim.saglik.httpKaynak', { dk: http.pencere_dk })}
          />
          <dl className="grid grid-cols-1 gap-2">
            <Olcu etiket={t('yonetim.saglik.istek')} deger={http.istek} />
            <Olcu
              etiket={t('yonetim.saglik.hata5xx')}
              deger={http.hata_5xx}
              {...(http.hata_5xx > 0 ? { ton: 'uyari' as const } : {})}
            />
            <Olcu
              etiket={t('yonetim.saglik.oran')}
              deger={`%${(http.oran_5xx * 100).toFixed(2)}`}
            />
          </dl>
        </Kart>
      </div>

      {kuyruklar.derinlikler.length > 0 ? (
        <Kart aria-labelledby="derinlik-baslik">
          <KartBasligi id="derinlik-baslik" baslik={t('yonetim.saglik.derinlikler')} />
          <Tablo etiket={t('yonetim.saglik.derinlikler')}>
            <thead>
              <tr>
                <Th>{t('yonetim.saglik.kuyruk')}</Th>
                <Th>{t('yonetim.saglik.durum')}</Th>
                <Th>{t('yonetim.saglik.sayi')}</Th>
              </tr>
            </thead>
            <tbody>
              {kuyruklar.derinlikler.map((d) => (
                <tr key={`${d.kuyruk}-${d.durum}`}>
                  <Td>{d.kuyruk}</Td>
                  <Td>{d.durum}</Td>
                  <Td>{d.sayi}</Td>
                </tr>
              ))}
            </tbody>
          </Tablo>
        </Kart>
      ) : null}
    </div>
  );
}
