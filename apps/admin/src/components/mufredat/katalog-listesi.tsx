'use client';

import { t } from '@kopru/i18n';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { SorguHatasi, Yukleniyor } from '../ui/durum-gosterimi';
import { Kart, SayfaBasligi } from '../ui/kart';
import { Rozet } from '../ui/rozet';
import { Uyari } from '../ui/uyari';

import { platform } from '@/lib/api';
import { useYonetici } from '@/lib/oturum';
import type { KatalogListesi } from '@/lib/tipler';

export const KATALOG_ANAHTARI = ['mufredat', 'kataloglar'] as const;

export function KatalogListesiSayfasi() {
  const yonetici = useYonetici();
  const sorgu = useQuery({
    queryKey: KATALOG_ANAHTARI,
    enabled: yonetici,
    queryFn: () => platform.al<KatalogListesi>('mufredat/kataloglar'),
  });

  if (!yonetici) {
    return (
      <>
        <SayfaBasligi baslik={t('yonetim.mufredat.baslik')} />
        <Uyari ton="uyari">{t('yonetim.ortak.yalnizYonetici')}</Uyari>
      </>
    );
  }

  return (
    <>
      <SayfaBasligi
        baslik={t('yonetim.mufredat.baslik')}
        aciklama={t('yonetim.mufredat.aciklama')}
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
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorgu.data.kataloglar.map((k) => {
            const taslak = k.surumler.find((s) => s.taslak);
            return (
              <li key={k.katalog_kodu}>
                <Kart className="flex h-full flex-col gap-3">
                  <h2 className="text-lg font-semibold">
                    {t(`yonetim.mufredat.katalog.${k.katalog_kodu}`)}
                  </h2>
                  <p className="text-sm text-metin-ikincil">
                    {(k.en_yuksek_yayinlanmis ?? 0) > 0
                      ? t('yonetim.mufredat.enYuksek', { n: k.en_yuksek_yayinlanmis ?? 0 })
                      : t('yonetim.mufredat.yayinYok')}
                  </p>
                  <div>
                    {taslak ? (
                      <Rozet ton="uyari">
                        {t('yonetim.mufredat.taslakVar', {
                          n: taslak.surum_no,
                          sayi: taslak.degisiklik_sayisi,
                        })}
                      </Rozet>
                    ) : (
                      <Rozet>{t('yonetim.mufredat.taslakYok')}</Rozet>
                    )}
                  </div>
                  <Link
                    href={`/mufredat/${k.katalog_kodu}`}
                    aria-label={`${t('yonetim.mufredat.ac')}: ${t(`yonetim.mufredat.katalog.${k.katalog_kodu}`)}`}
                    className="mt-auto inline-flex h-11 items-center justify-center rounded-orta border border-kenar bg-yuzey px-4 text-sm font-medium hover:bg-yuzey-ikincil"
                  >
                    {t('yonetim.mufredat.ac')}
                  </Link>
                </Kart>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
