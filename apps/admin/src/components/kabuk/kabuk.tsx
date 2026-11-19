'use client';

import { t } from '@kopru/i18n';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Building2,
  ClipboardList,
  Gauge,
  GraduationCap,
  LogOut,
  Megaphone,
  Menu,
  UserCog,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { TemaAnahtari } from '../tema-anahtari';
import { Dugme } from '../ui/dugme';
import { TaklitSeridi } from './taklit-seridi';

import { bff } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useTaklit } from '@/lib/oturum';
import type { PlatformRolu } from '@/lib/tipler';

interface Oge {
  yol: string;
  etiket: Parameters<typeof t>[0];
  Ikon: typeof Building2;
  yalnizYonetici?: boolean;
}

/** Destek rolu: kurum arama/detay, taklit, sistem sagligi, mesaj listesi. Yonetici: hepsi. */
const OGELER: readonly Oge[] = [
  { yol: '/kurumlar', etiket: 'yonetim.nav.kurumlar', Ikon: Building2 },
  { yol: '/taklit', etiket: 'yonetim.nav.taklit', Ikon: UserCog },
  { yol: '/denetim', etiket: 'yonetim.nav.denetim', Ikon: ClipboardList, yalnizYonetici: true },
  { yol: '/saglik', etiket: 'yonetim.nav.saglik', Ikon: Activity },
  { yol: '/mesajlar', etiket: 'yonetim.nav.mesajlar', Ikon: Megaphone },
  { yol: '/mufredat', etiket: 'yonetim.nav.mufredat', Ikon: GraduationCap, yalnizYonetici: true },
  { yol: '/motivasyon', etiket: 'yonetim.nav.motivasyon', Ikon: Gauge, yalnizYonetici: true },
];

export function Kabuk({ rol, children }: { rol: PlatformRolu; children: ReactNode }) {
  const yol = usePathname();
  const router = useRouter();
  const [menuAcik, setMenuAcik] = useState(false);
  const istemci = useQueryClient();
  const taklit = useTaklit();

  const cikis = async () => {
    await bff.yolla('oturum/cikis').catch(() => undefined);
    istemci.clear();
    router.replace('/giris');
  };

  const ogeler = OGELER.filter((o) => !o.yalnizYonetici || rol === 'yonetici');

  const gezinme = (
    <nav aria-label={t('yonetim.ortak.ana')} className="flex flex-col gap-1">
      {ogeler.map(({ yol: hedef, etiket, Ikon }) => {
        const aktif = yol === hedef || yol.startsWith(`${hedef}/`);
        return (
          <Link
            key={hedef}
            href={hedef}
            aria-current={aktif ? 'page' : undefined}
            onClick={() => {
              setMenuAcik(false);
            }}
            className={cn(
              'flex h-11 items-center gap-3 rounded-orta px-3 text-sm font-medium transition-colors',
              aktif
                ? 'bg-birincil-yumusak text-birincil'
                : 'text-metin-ikincil hover:bg-yuzey-ikincil hover:text-metin',
            )}
          >
            <Ikon className="size-4 shrink-0" aria-hidden />
            {t(etiket)}
          </Link>
        );
      })}
    </nav>
  );

  const alt = (
    <div className="flex flex-col gap-3 border-t border-kenar pt-4">
      <p className="px-1 text-xs text-metin-ikincil">
        {t('yonetim.nav.rol', {
          rol: t(rol === 'yonetici' ? 'platform.rol.yonetici' : 'platform.rol.destek'),
        })}
      </p>
      <TemaAnahtari className="self-start" />
      <Dugme gorunum="hayalet" className="justify-start" onClick={cikis}>
        <LogOut aria-hidden />
        {t('yonetim.nav.cikis')}
      </Dugme>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        href="#icerik"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-orta focus:bg-yuzey focus:px-3 focus:py-2"
      >
        {t('yonetim.ortak.icerigeGec')}
      </a>

      {/* Masaustu kenar cubugu */}
      <aside className="hidden border-r border-kenar bg-yuzey lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-between lg:p-4">
        <div className="flex flex-col gap-6">
          <p className="px-1 text-sm font-semibold">{t('yonetim.marka')}</p>
          {gezinme}
        </div>
        {alt}
      </aside>

      {/* Mobil ust cubuk */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-kenar bg-yuzey px-4 lg:hidden">
        <p className="min-w-0 truncate text-sm font-semibold">{t('yonetim.marka')}</p>
        <Dugme
          gorunum="hayalet"
          className="size-11 px-0"
          aria-expanded={menuAcik}
          aria-controls="mobil-menu"
          aria-label={menuAcik ? t('yonetim.ortak.menuyuKapat') : t('yonetim.ortak.menu')}
          onClick={() => {
            setMenuAcik((a) => !a);
          }}
        >
          {menuAcik ? <X aria-hidden /> : <Menu aria-hidden />}
        </Dugme>
      </header>
      {menuAcik ? (
        <div
          id="mobil-menu"
          className="flex flex-col gap-4 border-b border-kenar bg-yuzey p-4 lg:hidden"
        >
          {gezinme}
          {alt}
        </div>
      ) : null}

      <div className="min-w-0">
        {taklit.data ? <TaklitSeridi taklit={taklit.data} /> : null}
        <main id="icerik" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
