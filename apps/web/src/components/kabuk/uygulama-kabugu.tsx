'use client';

import { t } from '@kopru/i18n';
import { ArrowLeftRight, LogOut, Menu } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { AltMenuHucresi, NavSatiri } from './nav-baglantisi';

import { MarkaAdi, MarkaIsareti } from '@/components/marka';
import { TemaAnahtari } from '@/components/tema-anahtari';
import { Cekmece } from '@/components/ui/cekmece';
import { useKurum } from '@/kurum/baglam';
import { gorunurOgeler, gruplaginaAyir, mobilBolme } from '@/lib/navigasyon';
import { hexNormalle, okunurMetinRengi } from '@/lib/vurgu';
import { useOturum } from '@/oturum/saglayici';

function KurumRozeti() {
  const { uyelik } = useKurum();
  const renk = hexNormalle(uyelik.vurguRengi);
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-orta bg-vurgu text-sm font-semibold text-vurgu-uzeri"
      style={renk ? { color: okunurMetinRengi(renk) } : undefined}
    >
      {uyelik.kurumAd.charAt(0)}
    </span>
  );
}

function KurumDegistirici() {
  const { uyelik } = useKurum();
  return (
    <Link
      href="/kurum-sec"
      title={t('kurumSec.degistir')}
      className="group flex items-center gap-3 rounded-orta border border-kenar bg-yuzey p-2 pr-3 transition-colors hover:bg-yuzey-ikincil"
    >
      <KurumRozeti />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{uyelik.kurumAd}</span>
        <span className="block truncate text-xs text-metin-ikincil">
          {t(`roller.${uyelik.rol}`)}
        </span>
      </span>
      <ArrowLeftRight
        className="size-4 shrink-0 text-metin-ikincil"
        aria-label={t('kurumSec.degistir')}
      />
    </Link>
  );
}

function Menu_({ tiklandi }: { tiklandi?: () => void }) {
  const { uyelik, rol, acikModuller } = useKurum();
  const gruplar = gruplaginaAyir(gorunurOgeler({ rol, acikModuller }));
  return (
    <nav aria-label={t('nav.ana')} className="flex flex-col gap-5">
      {gruplar.map(({ grup, ogeler }) => (
        <div key={grup} className="flex flex-col gap-0.5">
          {gruplar.length > 1 ? (
            <h2 className="mb-1 px-3 text-xs font-medium text-metin-ikincil">
              {t(`nav.grup.${grup}`)}
            </h2>
          ) : null}
          {ogeler.map((oge) => (
            <NavSatiri
              key={oge.anahtar}
              oge={oge}
              kurumId={uyelik.kurumId}
              {...(tiklandi ? { tiklandi } : {})}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

function KullaniciAlani() {
  const { kullaniciAd } = useKurum();
  const { cikis } = useOturum();
  const router = useRouter();
  return (
    <div className="flex flex-col gap-3 border-t border-kenar pt-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="min-w-0 truncate text-sm font-medium">{kullaniciAd}</span>
        <TemaAnahtari />
      </div>
      <button
        type="button"
        onClick={() => {
          void cikis().then(() => {
            router.replace('/giris');
          });
        }}
        className="flex h-11 items-center gap-3 rounded-orta px-3 text-sm font-medium text-metin-ikincil transition-colors hover:bg-yuzey-ikincil hover:text-metin lg:h-10"
      >
        <LogOut className="size-[1.125rem]" aria-hidden />
        {t('oturum.cikis')}
      </button>
    </div>
  );
}

export function UygulamaKabugu({ children }: { children: ReactNode }) {
  const { uyelik, rol, acikModuller } = useKurum();
  const [cekmeceAcik, setCekmeceAcik] = useState(false);
  const { alt } = mobilBolme(gorunurOgeler({ rol, acikModuller }));

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Masaustu: sabit yan menu */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-5 overflow-y-auto border-r border-kenar bg-yuzey px-3 py-4 lg:flex">
        <Link href="/kurum-sec" className="px-1.5 pt-1" aria-label={t('marka.ad')}>
          <MarkaAdi />
        </Link>
        <KurumDegistirici />
        <div className="flex-1 pl-3">
          <Menu_ />
        </div>
        <KullaniciAlani />
      </aside>

      {/* Mobil: ust cubuk */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-kenar bg-yuzey/95 px-4 backdrop-blur lg:hidden">
        <MarkaIsareti className="size-7" />
        <Link href="/kurum-sec" className="min-w-0 flex-1" title={t('kurumSec.degistir')}>
          <span className="block truncate text-sm font-semibold">{uyelik.kurumAd}</span>
          <span className="block truncate text-xs text-metin-ikincil">
            {t(`roller.${uyelik.rol}`)}
          </span>
        </Link>
      </header>

      <main
        id="icerik"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-8 lg:px-10 lg:pb-14 lg:pt-10"
      >
        {children}
      </main>

      {/* Mobil: alt menu + cekmece */}
      <nav
        aria-label={t('nav.mobil')}
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-kenar bg-yuzey/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {alt.map((oge) => (
          <AltMenuHucresi key={oge.anahtar} oge={oge} kurumId={uyelik.kurumId} />
        ))}
        <button
          type="button"
          onClick={() => {
            setCekmeceAcik(true);
          }}
          aria-haspopup="dialog"
          className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-orta text-xs font-medium text-metin-ikincil"
        >
          <span className="flex h-7 w-12 items-center justify-center">
            <Menu className="size-5" aria-hidden />
          </span>
          {t('nav.daha')}
        </button>
      </nav>

      <Cekmece
        acik={cekmeceAcik}
        degisti={setCekmeceAcik}
        baslik={t('nav.daha')}
        kapatEtiketi={t('nav.menuKapat')}
      >
        <div className="flex flex-col gap-5 pb-2">
          <KurumDegistirici />
          <Menu_
            tiklandi={() => {
              setCekmeceAcik(false);
            }}
          />
          <KullaniciAlani />
        </div>
      </Cekmece>
    </div>
  );
}
