'use client';

import { t } from '@kopru/i18n';
import { CalendarPlus, ClipboardPlus, MessageCircleQuestion, Timer, UserPlus } from 'lucide-react';
import Link from 'next/link';

import { dugmeStili } from '@/components/ui/button';
import { Kart } from '@/components/ui/kart';
import { useKurum } from '@/kurum/baglam';
import { cn } from '@/lib/cn';
import { izinli } from '@/lib/yetki';

/**
 * Ogretmen/yonetici Bugun: hizli eylemler. Her biri ilgili ekrani ilgili formu acik halde getirir
 * (`?yeni=1` / `?davet=1`); modulu kapali ya da izni olmayan rolde eylem gosterilmez.
 */
export function BugunHizliEylemler() {
  const { uyelik, rol, acikModuller } = useKurum();
  const kok = `/${uyelik.kurumId}`;
  const eylemler = [
    acikModuller.includes('takvim') && izinli(rol, 'takvim.yaz')
      ? {
          anahtar: 'ders',
          href: `${kok}/takvim?yeni=1`,
          etiket: t('bugun.hizliDersEkle'),
          Ikon: CalendarPlus,
        }
      : null,
    acikModuller.includes('odev') && izinli(rol, 'odev.ver')
      ? {
          anahtar: 'odev',
          href: `${kok}/odevler?yeni=1`,
          etiket: t('bugun.hizliOdevVer'),
          Ikon: ClipboardPlus,
        }
      : null,
    izinli(rol, 'davet.yaz')
      ? {
          anahtar: 'ogrenci',
          href: `${kok}/ogrenciler?davet=1`,
          etiket: t('bugun.hizliOgrenciEkle'),
          Ikon: UserPlus,
        }
      : null,
  ].filter((e) => e !== null);
  if (eylemler.length === 0) return null;
  return (
    <Kart aria-labelledby="bugun-hizli-baslik" className="md:col-span-2">
      <h2
        id="bugun-hizli-baslik"
        className="border-b border-kenar px-5 py-4 text-base font-semibold"
      >
        {t('bugun.hizliEylemler')}
      </h2>
      <ul className="flex flex-wrap gap-3 p-5" data-testid="bugun-hizli-eylemler">
        {eylemler.map(({ anahtar, href, etiket, Ikon }) => (
          <li key={anahtar}>
            <Link href={href} className={dugmeStili({ gorunum: 'ikincil', boyut: 'lg' })}>
              <Ikon aria-hidden />
              {etiket}
            </Link>
          </li>
        ))}
      </ul>
    </Kart>
  );
}

const BUYUK =
  'flex min-h-16 items-center gap-3 rounded-buyuk px-4 py-3 text-left transition-colors sm:min-h-20 sm:px-5';

/**
 * Ogrenci Bugun: buyuk "Odaklan" ve "Soru sor" dugmeleri. Odak `oyunlastirma`, soru `soru_sor` modulune baglidir;
 * kapali modulun dugmesi gosterilmez.
 */
export function BugunOgrenciDugmeleri() {
  const { uyelik, acikModuller } = useKurum();
  const kok = `/${uyelik.kurumId}`;
  const odak = acikModuller.includes('oyunlastirma');
  const soru = acikModuller.includes('soru_sor');
  if (!odak && !soru) return null;
  return (
    <div className="grid grid-cols-2 gap-3" data-testid="bugun-buyuk-dugmeler">
      {odak ? (
        <Link
          href={`${kok}/odak`}
          className={cn(BUYUK, 'bg-birincil text-birincil-uzeri hover:bg-birincil/90')}
        >
          <Timer className="size-6 shrink-0 sm:size-7" aria-hidden />
          <span className="flex flex-col">
            <span className="text-lg font-semibold">{t('bugun.odaklan')}</span>
            <span className="hidden text-sm opacity-90 sm:block">{t('bugun.odaklanAciklama')}</span>
          </span>
        </Link>
      ) : null}
      {soru ? (
        <Link
          href={`${kok}/soru-sor`}
          className={cn(BUYUK, 'bg-vurgu text-vurgu-uzeri hover:bg-vurgu/90')}
        >
          <MessageCircleQuestion className="size-6 shrink-0 sm:size-7" aria-hidden />
          <span className="flex flex-col">
            <span className="text-lg font-semibold">{t('bugun.soruSor')}</span>
            <span className="hidden text-sm opacity-90 sm:block">{t('bugun.soruSorAciklama')}</span>
          </span>
        </Link>
      ) : null}
    </div>
  );
}
