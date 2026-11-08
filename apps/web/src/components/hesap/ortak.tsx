'use client';

import { t } from '@kopru/i18n';
import { CircleCheck } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { Dugme } from '@/components/ui/button';
import { Iskelet } from '@/components/ui/kart';
import { Uyari } from '@/components/ui/uyari';
import { hataMesaji } from '@/lib/api';
import { panoyaKopyala } from '@/lib/kopyala';

export type Bildirim = { tur: 'ok' | 'hata'; metin: string } | null;

/** Islem sonucu: basari `role="status"`, hata `role="alert"` ile okunur. */
export function BildirimKutusu({ bildirim }: { bildirim: Bildirim }) {
  if (!bildirim) return <div aria-live="polite" />;
  if (bildirim.tur === 'hata') return <Uyari>{bildirim.metin}</Uyari>;
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-orta bg-basari-yumusak px-3 py-2.5 text-sm text-basari"
    >
      <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{bildirim.metin}</span>
    </div>
  );
}

export const basari = (metin: string): Bildirim => ({ tur: 'ok', metin });
export const basarisiz = (hata: unknown): Bildirim => ({ tur: 'hata', metin: hataMesaji(hata) });

export function ListeIskeleti({ satir = 3 }: { satir?: number }) {
  return (
    <div role="status" aria-label={t('ortak.yukleniyor')} className="flex flex-col gap-px p-4">
      {Array.from({ length: satir }, (_, i) => (
        <Iskelet key={i} className="my-1.5 h-12 w-full" />
      ))}
    </div>
  );
}

/** Sayfalamali listenin altindaki "Daha fazla yukle" dugmesi. */
export function DahaFazla({
  daha,
  yukleniyor,
  yukle,
}: {
  daha: boolean;
  yukleniyor: boolean;
  yukle: () => void;
}) {
  if (!daha) return null;
  return (
    <div className="flex justify-center border-t border-kenar p-3">
      <Dugme gorunum="ikincil" boyut="sm" onClick={yukle} disabled={yukleniyor}>
        {yukleniyor ? t('hesap.ortak.yukleniyor') : t('hesap.ortak.dahaFazla')}
      </Dugme>
    </div>
  );
}

/** Kopyala dugmesi: sonucu kisa sure gosterir; pano yoksa metni secilebilir birakir. */
export function KopyalaDugmesi({
  metin,
  etiket = t('hesap.ortak.kopyala'),
  gorunum = 'ikincil',
  boyut = 'sm',
}: {
  metin: string;
  etiket?: string;
  gorunum?: 'ikincil' | 'hayalet' | 'birincil';
  boyut?: 'sm' | 'md';
}) {
  const [durum, setDurum] = useState<'bos' | 'tamam' | 'olmadi'>('bos');
  useEffect(() => {
    if (durum === 'bos') return;
    const z = setTimeout(() => {
      setDurum('bos');
    }, 2500);
    return () => {
      clearTimeout(z);
    };
  }, [durum]);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Dugme
        type="button"
        gorunum={gorunum}
        boyut={boyut}
        onClick={() => {
          void panoyaKopyala(metin).then((ok) => {
            setDurum(ok ? 'tamam' : 'olmadi');
          });
        }}
      >
        {durum === 'tamam' ? t('hesap.ortak.kopyalandi') : etiket}
      </Dugme>
      <span role="status" className="text-xs text-hata empty:hidden">
        {durum === 'olmadi' ? t('hesap.ortak.kopyalanamadi') : ''}
      </span>
    </span>
  );
}

/** Kisa tarih (gg.aa.yyyy) ve goreli zaman, Turkce. */
export function tarihYaz(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(iso));
}
export function zamanYaz(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

export function Bolum({
  baslik,
  aciklama,
  eylemler,
  children,
}: {
  baslik: string;
  aciklama?: string;
  eylemler?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-buyuk border border-kenar bg-yuzey" aria-label={baslik}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-kenar px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">{baslik}</h2>
          {aciklama ? <p className="mt-0.5 text-sm text-metin-ikincil">{aciklama}</p> : null}
        </div>
        {eylemler}
      </header>
      {children}
    </section>
  );
}
