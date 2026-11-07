'use client';

import { t } from '@kopru/i18n';
import { ArrowRight, Building2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { BosDurum } from '@/components/bos-durum';
import { Dugme } from '@/components/ui/button';
import { Uyari } from '@/components/ui/uyari';
import { hataMesaji } from '@/lib/api';
import { cn } from '@/lib/cn';
import { faz1Roller } from '@/lib/navigasyon';
import { hexNormalle, okunurMetinRengi } from '@/lib/vurgu';
import { useOturum } from '@/oturum/saglayici';
import type { Oturum } from '@/oturum/tipler';

export function KurumListesi({ oturum }: { oturum: Oturum }) {
  const router = useRouter();
  const { yenile, cikis } = useOturum();
  const [aciliyor, setAciliyor] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const uyelikler = oturum.uyelikler.filter((u) => faz1Roller.includes(u.rol));

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
          />
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

      <div className="mt-8 flex items-center justify-between text-sm text-metin-ikincil">
        <span>{oturum.kullanici.ad}</span>
        <Dugme gorunum="hayalet" boyut="sm" onClick={() => void cikis()}>
          {t('oturum.cikis')}
        </Dugme>
      </div>
    </div>
  );
}
