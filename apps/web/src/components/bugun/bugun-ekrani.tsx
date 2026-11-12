'use client';

import { t } from '@kopru/i18n';
import { ClipboardCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';

import { BolumKarti } from './bolum-karti';
import { BugunDersleriKarti } from './bugun-dersleri';

import { BosDurum } from '@/components/bos-durum';
import { BugunGeriBildirimKarti } from '@/components/geri-bildirim/bugun-karti';
import { SayfaBasligi } from '@/components/kabuk/sayfa-basligi';
import { Karakter, karakterAdi } from '@/components/karakter';
import {
  BugunBekleyenKarti,
  BugunOdevKarti,
  BugunPlanKarti,
} from '@/components/ogrenme/bugun-kartlari';
import { BugunSoruKarti } from '@/components/soru/bugun-karti';
import { dugmeStili } from '@/components/ui/button';
import { Iskelet, Kart } from '@/components/ui/kart';
import { BugunYoklamaKarti } from '@/components/yoklama/bugun-karti';
import { useKurum } from '@/kurum/baglam';
import { useOgrenciBugun } from '@/lib/bugun-verisi';
import type { NavBaglami } from '@/lib/navigasyon';

function selam(saat: number): string {
  if (saat < 11) return t('bugun.gunaydin');
  if (saat < 18) return t('bugun.iyiGunler');
  return t('bugun.iyiAksamlar');
}

function BugunBasligi({ aciklama }: { aciklama: string }) {
  const { kullaniciAd } = useKurum();
  const simdi = new Date();
  const tarih = new Intl.DateTimeFormat('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(simdi);
  const ad = kullaniciAd.split(' ')[0] ?? '';
  const selamMetni = selam(simdi.getHours());
  return (
    <SayfaBasligi
      baslik={ad ? t('bugun.selam', { selam: selamMetni, ad }) : selamMetni}
      aciklama={aciklama}
    >
      <time
        dateTime={simdi.toISOString().slice(0, 10)}
        className="rounded-full bg-vurgu-yumusak px-3.5 py-1.5 text-sm font-medium capitalize"
        suppressHydrationWarning
      >
        {tarih}
      </time>
    </SayfaBasligi>
  );
}

function PersonelBugun({ yonetim }: { yonetim: boolean }) {
  return (
    <>
      <BugunBasligi
        aciklama={yonetim ? t('bugun.yoneticiAciklama') : t('bugun.ogretmenAciklama')}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <BugunDersleriKarti />
        <BugunSoruKarti />
        <BugunYoklamaKarti />
        <BugunBekleyenKarti />
        {yonetim ? (
          <div className="md:col-span-2">
            <BolumKarti
              baslik={t('bugun.kurumOzet')}
              yukleniyor={false}
              hata={false}
              tekrarDene={() => undefined}
            >
              <BosDurum
                ikon={ClipboardCheck}
                baslik={t('bugun.kurumOzetBos')}
                aciklama={t('bugun.kurumOzetBosAciklama')}
              />
            </BolumKarti>
          </div>
        ) : null}
      </div>
    </>
  );
}

function OgrenciBugun() {
  const { uyelik, acikModuller } = useKurum();
  const veri = useOgrenciBugun(uyelik.kurumId);
  const kok = `/${uyelik.kurumId}`;
  const karakter = veri.data?.karakter;
  const karakterVar = acikModuller.includes('oyunlastirma');

  return (
    <>
      <BugunBasligi aciklama={t('bugun.ogrenciAciklama')} />
      <div className="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
        {acikModuller.includes('geri_bildirim') ? <BugunGeriBildirimKarti /> : null}
        <BugunDersleriKarti />
        {acikModuller.includes('haftalik_plan') ? (
          <BugunPlanKarti />
        ) : (
          <BolumKarti
            baslik={t('bugun.gorevler')}
            yukleniyor={veri.isPending}
            hata={veri.isError}
            tekrarDene={() => void veri.refetch()}
          >
            {veri.data?.gorevler.length ? null : (
              <BosDurum
                ikon={Sparkles}
                baslik={t('bugun.gorevBos')}
                aciklama={t('bugun.gorevBosAciklama')}
              >
                <Link href={`${kok}/odevlerim`} className={dugmeStili({ gorunum: 'ikincil' })}>
                  {t('bugun.gorevBosEylem')}
                </Link>
              </BosDurum>
            )}
          </BolumKarti>
        )}
        {acikModuller.includes('odev') ? <BugunOdevKarti /> : null}

        {karakterVar ? (
          <Kart
            aria-labelledby="karakter-baslik"
            className="flex flex-col items-center bg-vurgu-yumusak p-5 text-center"
          >
            <h2 id="karakter-baslik" className="self-start text-base font-semibold">
              {t('bugun.karakterBaslik')}
            </h2>
            {karakter ? (
              <>
                <div className="my-3 rounded-full bg-yuzey p-3">
                  <Karakter tur={karakter.tur} asama={karakter.asama} boyut={144} oncelikli />
                </div>
                <p className="text-sm text-metin-ikincil">
                  {t('bugun.karakterAciklama', { ad: karakterAdi(karakter.tur) })}
                </p>
                <Link
                  href={`${kok}/karakterim`}
                  className={dugmeStili({ gorunum: 'ikincil', className: 'mt-4' })}
                >
                  {t('bugun.karakterGor')}
                </Link>
              </>
            ) : (
              <Iskelet className="my-3 size-40 rounded-full" />
            )}
          </Kart>
        ) : null}
      </div>
    </>
  );
}

export function BugunEkrani() {
  const { rol } = useKurum();
  const baglam: Pick<NavBaglami, 'rol'> = { rol };
  return baglam.rol === 'ogrenci' ? (
    <OgrenciBugun />
  ) : (
    <PersonelBugun yonetim={baglam.rol === 'yonetici' || baglam.rol === 'sahip'} />
  );
}
