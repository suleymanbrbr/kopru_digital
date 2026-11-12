'use client';

import { t } from '@kopru/i18n';
import { Flame, Timer, Zap } from 'lucide-react';
import Link from 'next/link';

import { KarakterGorseli } from './ortak';
import { GunHedefi } from './seri-karti';

import { HataDurumu } from '@/components/hata-durumu';
import { dugmeStili } from '@/components/ui/button';
import { Iskelet, Kart } from '@/components/ui/kart';
import { useKurum } from '@/kurum/baglam';
import { hataMesaji } from '@/lib/api';
import { seriMesaji } from '@/lib/motivasyon/seri';
import { modulKapaliMi, useBenim, useKarakterim, useSeri } from '@/lib/motivasyon/veri';

/**
 * Ogrenci "Bugun" ekraninda: karakter, seri alevi, gunun hedef cubugu ve bugunku XP. Modul kapaliysa
 * (`403 modul_kapali`) hic cizilmez. Basa bakan metin suclayici degildir.
 */
export function BugunMotivasyonKarti() {
  const { uyelik } = useKurum();
  const kurumId = uyelik.kurumId;
  const kok = `/${kurumId}`;
  const benim = useBenim(kurumId);
  const karakter = useKarakterim(kurumId);
  const seri = useSeri(kurumId);

  if (modulKapaliMi(benim.error) || modulKapaliMi(karakter.error)) return null;

  if (benim.isError || karakter.isError) {
    const hata = benim.error ?? karakter.error;
    return (
      <Kart aria-labelledby="motivasyon-bugun-baslik">
        <h2 id="motivasyon-bugun-baslik" className="sr-only">
          {t('bugun.karakterBaslik')}
        </h2>
        <HataDurumu
          aciklama={hataMesaji(hata)}
          tekrarDene={() => {
            void benim.refetch();
            void karakter.refetch();
          }}
          className="py-8"
        />
      </Kart>
    );
  }

  if (benim.isPending || karakter.isPending) {
    return (
      <Kart aria-labelledby="motivasyon-bugun-baslik" className="p-5">
        <h2 id="motivasyon-bugun-baslik" className="text-base font-semibold">
          {t('bugun.karakterBaslik')}
        </h2>
        <div role="status" aria-label={t('ortak.yukleniyor')}>
          <Iskelet className="mx-auto my-3 size-36 rounded-full" />
        </div>
      </Kart>
    );
  }

  const k = karakter.data.karakter;
  const d = benim.data;

  return (
    <Kart
      aria-labelledby="motivasyon-bugun-baslik"
      className="flex flex-col gap-4 bg-vurgu-yumusak p-5"
    >
      <h2 id="motivasyon-bugun-baslik" className="text-base font-semibold">
        {t('bugun.karakterBaslik')}
      </h2>

      {k ? (
        <div className="flex items-center gap-4">
          <div className="shrink-0 rounded-full bg-yuzey p-2">
            <KarakterGorseli
              turKodu={k.tur_kodu}
              asama={k.asama}
              boyut={104}
              oncelikli
              kusanilanlar={k.kusanilanlar}
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{k.ad}</p>
            <p className="text-sm text-metin-ikincil">
              {t('motivasyon.yuva.turAsama', { tur: k.tur_adi, asama: k.asama_adi })}
            </p>
            <p className="mt-1 text-sm font-medium" data-testid="bugun-seviye">
              {t('motivasyon.yuva.seviye', { n: d.seviye })}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <p className="text-sm text-metin-ikincil">{t('motivasyon.bugun.karakterYok')}</p>
          <Link href={`${kok}/karakterim`} className={dugmeStili()}>
            {t('motivasyon.bugun.karakterSec')}
          </Link>
        </div>
      )}

      <p className="flex items-center gap-2 text-sm font-medium" data-testid="bugun-xp">
        <Zap className="size-4 text-uyari" aria-hidden />
        {t('motivasyon.bugun.xp', { bugun: d.bugun.xp })}
      </p>

      {seri.data ? (
        <div className="flex flex-col gap-3 rounded-orta bg-yuzey p-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Flame className="size-5 text-uyari" aria-hidden />
            <span>{seriMesaji(seri.data)}</span>
          </p>
          <GunHedefi seri={seri.data} />
        </div>
      ) : seri.isPending ? (
        <Iskelet className="h-28 w-full" />
      ) : null}

      {k ? (
        <div className="flex flex-wrap gap-2">
          <Link href={`${kok}/karakterim`} className={dugmeStili({ gorunum: 'ikincil' })}>
            {t('bugun.karakterGor')}
          </Link>
          <Link href={`${kok}/odak`} className={dugmeStili({ gorunum: 'ikincil' })}>
            <Timer aria-hidden />
            {t('motivasyon.bugun.odak')}
          </Link>
        </div>
      ) : null}
    </Kart>
  );
}
