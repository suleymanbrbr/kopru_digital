'use client';

import { t } from '@kopru/i18n';
import { ArrowRight, Building2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { BosDurum } from '@/components/bos-durum';
import { Dugme, dugmeStili } from '@/components/ui/button';
import { Uyari } from '@/components/ui/uyari';
import { hataMesaji } from '@/lib/api';
import { cn } from '@/lib/cn';
import { secilebilirUyelikler, secimiAtla } from '@/lib/kurum-secimi';
import { faz1Roller } from '@/lib/navigasyon';
import { hexNormalle, okunurMetinRengi } from '@/lib/vurgu';
import { useOturum } from '@/oturum/saglayici';
import type { Oturum } from '@/oturum/tipler';

export function KurumListesi({ oturum }: { oturum: Oturum }) {
  const router = useRouter();
  const { yenile, cikis } = useOturum();
  const [aciliyor, setAciliyor] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const faz1 = oturum.uyelikler.filter((u) => faz1Roller.includes(u.rol));
  // Bireysel kurumda tek satir (sahip uyeligi); tek bireysel kurum varsa secim ekrani atlanir.
  const uyelikler = secilebilirUyelikler(faz1);
  const atla = secimiAtla(faz1);
  const atlandi = useRef(false);

  async function sec(uyelikId: string, kurumId: string) {
    setAciliyor(uyelikId);
    setHata(null);
    try {
      await yenile({ uyelikId });
      router.push(`/${kurumId}/bugun`);
    } catch (e) {
      setHata(hataMesaji(e));
      setAciliyor(null);
    }
  }

  useEffect(() => {
    if (!atla || atlandi.current) return;
    atlandi.current = true;
    void sec(atla.id, atla.kurumId);
    // `sec` her render yeni islev; yalniz atlanacak uyelik degisince calisir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atla?.id]);

  if (atla && hata === null) {
    return (
      <div
        role="status"
        className="mx-auto flex min-h-dvh w-full max-w-2xl items-center justify-center px-5 text-metin-ikincil"
      >
        {t('kurumSec.aciliyor')}
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10 sm:py-16">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{t('kurumSec.baslik')}</h1>
        <p className="mt-2 text-base text-metin-ikincil">{t('kurumSec.aciklama')}</p>
      </header>

      {hata ? <Uyari className="mb-4">{hata}</Uyari> : null}

      {uyelikler.length === 0 ? (
        <div className="rounded-buyuk border border-kenar bg-yuzey">
          <BosDurum
            ikon={Building2}
            baslik={t('kurumSec.bos')}
            aciklama={t('kurumSec.bosAciklama')}
          >
            <Link href="/sinif-kodu" className={dugmeStili()}>
              {t('hesap.sinifKodu.katilLink')}
            </Link>
          </BosDurum>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {uyelikler.map((u) => {
            const renk = hexNormalle(u.vurguRengi);
            return (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => void sec(u.id, u.kurumId)}
                  disabled={aciliyor !== null}
                  aria-label={`${u.kurumAd}, ${t(`roller.${u.rol}`)}. ${t('kurumSec.sec')}`}
                  className={cn(
                    'group flex w-full items-center gap-4 rounded-buyuk border border-kenar bg-yuzey p-4 text-left transition-colors hover:border-birincil/50 hover:bg-yuzey-ikincil/60 disabled:opacity-60',
                    aciliyor === u.id && 'border-birincil',
                  )}
                >
                  <span
                    aria-hidden
                    className="flex size-12 shrink-0 items-center justify-center rounded-orta bg-birincil-yumusak text-lg font-semibold text-birincil"
                    style={
                      renk ? { backgroundColor: renk, color: okunurMetinRengi(renk) } : undefined
                    }
                  >
                    {u.kurumAd.charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">{u.kurumAd}</span>
                    <span className="block text-sm text-metin-ikincil">{t(`roller.${u.rol}`)}</span>
                  </span>
                  <span className="flex items-center gap-1 text-sm font-medium text-birincil">
                    {aciliyor === u.id ? t('kurumSec.aciliyor') : null}
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-6">
        <Link
          href="/sinif-kodu"
          className="inline-flex min-h-11 items-center rounded-orta text-sm font-medium text-birincil hover:underline"
        >
          {t('hesap.sinifKodu.katilLink')}
        </Link>
        <p className="text-sm text-metin-ikincil">{t('hesap.sinifKodu.katilAciklama')}</p>
      </div>

      <div className="mt-8 flex items-center justify-between text-sm text-metin-ikincil">
        <span>{oturum.kullanici.ad || oturum.kullanici.telefon}</span>
        <Dugme gorunum="hayalet" boyut="sm" onClick={() => void cikis()}>
          {t('oturum.cikis')}
        </Dugme>
      </div>
    </div>
  );
}
