'use client';

import {
  KATILIM_KODU_ALFABESI,
  KATILIM_KODU_UZUNLUK,
  KendiKatilimIstegiSema,
} from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Hourglass } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { z } from 'zod';

import { basari, basarisiz, BildirimKutusu, zamanYaz, type Bildirim } from './ortak';

import { BosDurum } from '@/components/bos-durum';
import { HataDurumu } from '@/components/hata-durumu';
import { Dugme, dugmeStili } from '@/components/ui/button';
import { Etiket, Girdi } from '@/components/ui/input';
import { Kart } from '@/components/ui/kart';
import { OnayPenceresi } from '@/components/ui/pencere';
import { Uyari } from '@/components/ui/uyari';
import { hataMesaji, UygulamaHatasi } from '@/lib/api';
import { hesapIstek } from '@/lib/hesap-istek';
import { yenidenDene } from '@/lib/sayfali-sorgu';
import { useOturum } from '@/oturum/saglayici';

// Mock kurumlarin kimlikleri UUID degildir; gercek api UUID doner.
const istekSema = KendiKatilimIstegiSema.extend({ kurum_id: z.string(), grup_id: z.string() });
const listeSema = z.object({ istekler: z.array(istekSema) });
type Istek = z.output<typeof istekSema>;

/** Buyuk/kucuk harf, bosluk ve tireyi yok sayar. */
export function kodNormalle(ham: string): string {
  return ham.replace(/[\s-]/g, '').toUpperCase();
}
export function kodGecerliMi(kod: string): boolean {
  return new RegExp(`^[${KATILIM_KODU_ALFABESI}]{${String(KATILIM_KODU_UZUNLUK)}}$`).test(kod);
}

const BEKLEYEN = ['hesap', 'sinif-kodu', 'bekleyen'] as const;
const ONAYLANAN = ['hesap', 'sinif-kodu', 'onaylanan'] as const;

export function SinifKoduKatil() {
  const qc = useQueryClient();
  const router = useRouter();
  const { yenile } = useOturum();
  const kimlik = useId();
  const [kod, setKod] = useState('');
  const [yerel, setYerel] = useState<string | null>(null);
  const [bildirim, setBildirim] = useState<Bildirim>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [iptalEdilecek, setIptalEdilecek] = useState<Istek | null>(null);

  const bekleyen = useQuery({
    queryKey: BEKLEYEN,
    retry: yenidenDene,
    queryFn: () => hesapIstek('sinif-kodu/istekler?durum=bekliyor', { sema: listeSema }),
  });
  const onaylanan = useQuery({
    queryKey: ONAYLANAN,
    retry: yenidenDene,
    queryFn: () => hesapIstek('sinif-kodu/istekler?durum=onaylandi', { sema: listeSema }),
  });

  const katil = useMutation({
    mutationFn: (temiz: string) =>
      hesapIstek('sinif-kodu/katil', { govde: { kod: temiz }, sema: istekSema }),
    onSuccess: (istek) => {
      setKod('');
      setHata(null);
      setBildirim(
        basari(
          t('hesap.sinifKodu.gonderildi', {
            kurum: istek.kurum_ad ?? '',
            grup: istek.grup_ad ?? '',
          }),
        ),
      );
      void qc.invalidateQueries({ queryKey: BEKLEYEN });
    },
    onError: (e) => {
      setBildirim(null);
      if (e instanceof UygulamaHatasi && e.durum === 429) setHata(t('hesap.sinifKodu.cokDeneme'));
      else if (e instanceof UygulamaHatasi && e.durum === 410)
        setHata(t('hesap.sinifKodu.kodGecersiz'));
      else if (e instanceof UygulamaHatasi && e.kod === 'zaten_uye')
        setHata(t('hesap.sinifKodu.zatenUye'));
      else setHata(hataMesaji(e));
    },
  });

  const iptal = useMutation({
    mutationFn: (i: Istek) => hesapIstek(`sinif-kodu/istekler/${i.id}/iptal`, { yontem: 'POST' }),
    onMutate: async (i) => {
      await qc.cancelQueries({ queryKey: BEKLEYEN });
      const onceki = qc.getQueryData<{ istekler: Istek[] }>(BEKLEYEN);
      qc.setQueryData<{ istekler: Istek[] }>(BEKLEYEN, (v) =>
        v ? { istekler: v.istekler.filter((x) => x.id !== i.id) } : v,
      );
      setIptalEdilecek(null);
      return { onceki };
    },
    onError: (e, _i, baglam) => {
      qc.setQueryData(BEKLEYEN, baglam?.onceki);
      setBildirim(basarisiz(e));
    },
    onSuccess: () => {
      setBildirim(basari(t('hesap.sinifKodu.iptalEdildi')));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: BEKLEYEN }),
  });

  function gonder(olay: React.SyntheticEvent) {
    olay.preventDefault();
    setHata(null);
    setBildirim(null);
    const temiz = kodNormalle(kod);
    if (!kodGecerliMi(temiz)) {
      setYerel(t('hesap.sinifKodu.kodHata'));
      return;
    }
    setYerel(null);
    katil.mutate(temiz);
  }

  async function kurumlaraGit() {
    // Onaylanan istekle yeni uyelik olustu; oturum ozetini tazele, sonra kurum listesine git.
    await yenile().catch(() => undefined);
    router.push('/kurum-sec');
  }

  const hataId = `${kimlik}-hata`;
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 py-10 sm:py-16">
      <Link
        href="/kurum-sec"
        className={dugmeStili({
          gorunum: 'hayalet',
          boyut: 'sm',
          className: '-ml-3 mb-4 self-start',
        })}
      >
        <ArrowLeft aria-hidden />
        {t('hesap.sinifKodu.kurumlaraDon')}
      </Link>
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">{t('hesap.sinifKodu.baslik')}</h1>
        <p className="mt-2 text-base text-metin-ikincil">{t('hesap.sinifKodu.aciklama')}</p>
      </header>

      <Kart className="p-5">
        <form onSubmit={gonder} noValidate className="flex flex-col gap-4">
          {hata ? <Uyari>{hata}</Uyari> : null}
          <div className="flex flex-col gap-1.5">
            <Etiket htmlFor={`${kimlik}-kod`}>{t('hesap.sinifKodu.kod')}</Etiket>
            <Girdi
              id={`${kimlik}-kod`}
              value={kod}
              maxLength={16}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder={t('hesap.sinifKodu.kodYer')}
              aria-invalid={yerel ? true : undefined}
              aria-describedby={yerel ? hataId : `${kimlik}-yardim`}
              className="font-mono text-lg uppercase tracking-widest"
              onChange={(e) => {
                setKod(e.target.value);
              }}
            />
            {yerel ? (
              <p id={hataId} className="text-sm text-hata">
                {yerel}
              </p>
            ) : (
              <p id={`${kimlik}-yardim`} className="text-sm text-metin-ikincil">
                {t('hesap.sinifKodu.kodYardim')}
              </p>
            )}
          </div>
          <Dugme type="submit" disabled={katil.isPending}>
            {katil.isPending ? t('hesap.sinifKodu.gonderiliyor') : t('hesap.sinifKodu.gonder')}
          </Dugme>
        </form>
      </Kart>

      <div className="mt-4 empty:hidden">
        <BildirimKutusu bildirim={bildirim} />
      </div>

      {onaylanan.data && onaylanan.data.istekler.length > 0 ? (
        <div
          role="status"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-orta bg-basari-yumusak px-4 py-3 text-sm text-metin"
        >
          <span>
            {onaylanan.data.istekler
              .map((i) => `${i.kurum_ad ?? ''} / ${i.grup_ad ?? ''}`)
              .join(', ')}
          </span>
          <Dugme boyut="sm" gorunum="ikincil" onClick={() => void kurumlaraGit()}>
            {t('hesap.sinifKodu.kurumlaraDon')}
          </Dugme>
        </div>
      ) : null}

      <section className="mt-8" aria-label={t('hesap.sinifKodu.bekleyenBaslik')}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('hesap.sinifKodu.bekleyenBaslik')}</h2>
          <Dugme
            gorunum="hayalet"
            boyut="sm"
            onClick={() => {
              void bekleyen.refetch();
              void onaylanan.refetch();
            }}
          >
            {t('hesap.sinifKodu.yenile')}
          </Dugme>
        </div>
        <Kart>
          {bekleyen.isPending ? (
            <div role="status" className="p-5 text-sm text-metin-ikincil">
              {t('hesap.ortak.yukleniyor')}
            </div>
          ) : bekleyen.isError ? (
            <HataDurumu
              baslik={t('hesap.sinifKodu.bekleyenYuklenemedi')}
              aciklama={hataMesaji(bekleyen.error)}
              tekrarDene={() => void bekleyen.refetch()}
              className="py-8"
            />
          ) : bekleyen.data.istekler.length === 0 ? (
            <BosDurum className="py-8" ikon={Hourglass} baslik={t('hesap.sinifKodu.bekleyenBos')} />
          ) : (
            <ul className="divide-y divide-kenar">
              {bekleyen.data.istekler.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {i.kurum_ad ?? '—'} · {i.grup_ad ?? '—'}
                    </p>
                    <p className="text-sm text-metin-ikincil">
                      {t('hesap.sinifKodu.gonderildiZaman', { zaman: zamanYaz(i.created_at) })}
                    </p>
                  </div>
                  <Dugme
                    gorunum="ikincil"
                    boyut="sm"
                    aria-label={t('hesap.sinifKodu.iptalAria', { grup: i.grup_ad ?? '' })}
                    onClick={() => {
                      setIptalEdilecek(i);
                    }}
                  >
                    {t('hesap.sinifKodu.iptal')}
                  </Dugme>
                </li>
              ))}
            </ul>
          )}
        </Kart>
      </section>

      <OnayPenceresi
        acik={iptalEdilecek !== null}
        degisti={(a) => {
          if (!a) setIptalEdilecek(null);
        }}
        baslik={t('hesap.sinifKodu.iptalBaslik')}
        aciklama={t('hesap.sinifKodu.iptalAciklama')}
        onayEtiketi={t('hesap.sinifKodu.iptalOnay')}
        tehlikeli
        bekliyor={iptal.isPending}
        onay={() => {
          if (iptalEdilecek) iptal.mutate(iptalEdilecek);
        }}
      />
    </div>
  );
}
