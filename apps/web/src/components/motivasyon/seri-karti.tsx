'use client';

import type { MotivasyonSeriDetayi } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { Check, Flame, Minus, Pause, RotateCcw, Snowflake, type LucideIcon } from 'lucide-react';

import { Ilerleme } from './ortak';

import { Kart } from '@/components/ui/kart';
import { cn } from '@/lib/cn';
import {
  gunGosterimi,
  gunKisa,
  hedefAdi,
  hedefIlerlemeMetni,
  onarimMetni,
  seriMesaji,
  takvimOzeti,
  type GunSimgesi,
} from '@/lib/motivasyon/seri';

const IKONLAR: Record<GunSimgesi, LucideIcon> = {
  tik: Check,
  kar: Snowflake,
  duraklat: Pause,
  onarim: RotateCcw,
  nokta: Minus,
};

const GUN_ADLARI = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;

/** Takvimde simgesi olan durumlar (aciklama satiri); `yok`/`kacirildi` aciklama gerektirmez. */
const LEJANT = ['aktif', 'dondurma', 'duraklatma', 'onarim'] as const;

function gunNumarasi(tarih: string): string {
  return String(Number(tarih.slice(8, 10)));
}

/**
 * Seri alevi + 35 gunluk takvim. Durumlar simge VE metinle gosterilir (renge dayanmaz). "Kacirdin" gibi
 * suclayan dil yoktur: kayitsiz gunler notr bir noktayla, kacirilanlar "calisilmayan gun" diye anilir.
 */
export function SeriKarti({ seri }: { seri: MotivasyonSeriDetayi }) {
  const ilk = seri.gunler[0];
  const bosBaslangic = ilk ? (new Date(`${ilk.gun}T00:00:00Z`).getUTCDay() + 6) % 7 : 0;
  const onarim = onarimMetni(seri);
  const tas = seri.sonraki_kilometre_tasi;

  return (
    <Kart aria-labelledby="seri-baslik" className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-uyari-yumusak text-uyari"
        >
          <Flame className="size-7" />
        </span>
        <div className="min-w-0">
          <h2 id="seri-baslik" className="text-base font-semibold">
            {t('motivasyon.seri.baslik')}
          </h2>
          <p className="text-lg font-semibold leading-snug" data-testid="seri-mesaji">
            {seriMesaji(seri)}
          </p>
          <p className="mt-0.5 text-sm text-metin-ikincil">
            {t('motivasyon.seri.rekor', { n: seri.en_uzun_seri })}
            {tas
              ? ` ${t('motivasyon.seri.kilometreTasi', { hedef: tas.hedef, kalan: tas.kalan })}`
              : ''}
          </p>
        </div>
      </div>

      {onarim ? (
        <p
          role="status"
          className="rounded-orta bg-birincil-yumusak px-3 py-2.5 text-sm"
          data-testid="seri-onarim"
        >
          {onarim}
        </p>
      ) : null}

      <div>
        <p className="sr-only">{takvimOzeti(seri.gunler)}</p>
        <div
          aria-hidden
          className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-metin-ikincil"
        >
          {GUN_ADLARI.map((g) => (
            <span key={g}>{g}</span>
          ))}
        </div>
        <ol
          aria-label={t('motivasyon.seri.takvimEtiketi')}
          className="grid grid-cols-7 gap-1"
          data-testid="seri-takvimi"
        >
          {Array.from({ length: bosBaslangic }, (_, i) => (
            <li key={`bos-${String(i)}`} aria-hidden className="h-11" />
          ))}
          {seri.gunler.map((g) => {
            const gosterim = gunGosterimi(g.durum);
            const Ikon = IKONLAR[gosterim.simge];
            return (
              <li
                key={g.gun}
                data-durum={g.durum}
                data-bugun={g.bugun || undefined}
                aria-label={`${gunKisa(g.gun)}${g.bugun ? `, ${t('motivasyon.seri.bugun')}` : ''}: ${gosterim.etiket}`}
                className={cn(
                  'flex h-11 flex-col items-center justify-center rounded-orta text-xs',
                  g.durum === 'aktif' && 'bg-basari-yumusak text-metin',
                  g.durum === 'dondurma' && 'bg-birincil-yumusak text-metin',
                  g.durum === 'duraklatma' && 'bg-yuzey-ikincil text-metin',
                  g.durum === 'onarim' && 'bg-uyari-yumusak text-metin',
                  (g.durum === 'yok' || g.durum === 'kacirildi') &&
                    'border border-dashed border-kenar text-metin-ikincil',
                  g.bugun && 'ring-2 ring-birincil',
                )}
              >
                <span aria-hidden className="tabular-nums">
                  {gunNumarasi(g.gun)}
                </span>
                <Ikon aria-hidden className="size-3.5" />
              </li>
            );
          })}
        </ol>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-metin-ikincil">
          {LEJANT.map((d) => {
            const g = gunGosterimi(d);
            const Ikon = IKONLAR[g.simge];
            return (
              <li key={d} className="flex items-center gap-1.5">
                <Ikon aria-hidden className="size-3.5" />
                {g.etiket}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="text-sm text-metin-ikincil">
        {t('motivasyon.seri.haklar', { dondurma: seri.dondurma_stogu, onarim: seri.onarim_hakki })}
      </p>
    </Kart>
  );
}

/**
 * Bugunun hedef cubugu: seri hedeflerinden her biri tek basina gunu seriye sayar; hangisi ne kadar
 * kaldi gosterilir. Gun tamamsa tebrik metni.
 */
export function GunHedefi({ seri }: { seri: MotivasyonSeriDetayi }) {
  return (
    <div className="flex flex-col gap-3" data-testid="gun-hedefi">
      {seri.bugun_aktif ? (
        <p role="status" className="rounded-orta bg-basari-yumusak px-3 py-2 text-sm font-medium">
          {t('motivasyon.hedef.tamam')}
        </p>
      ) : (
        <p className="text-sm text-metin-ikincil">{t('motivasyon.hedef.aciklama')}</p>
      )}
      <ul className="flex flex-col gap-3">
        {seri.hedefler.map((h) => (
          <li key={h.tur}>
            <Ilerleme
              deger={h.yapilan}
              ust={h.esik}
              etiket={hedefAdi(h)}
              ton={h.kalan === 0 ? 'basari' : 'birincil'}
              metin={
                <>
                  <span className="font-medium text-metin">{hedefAdi(h)}</span>
                  {' · '}
                  {hedefIlerlemeMetni(h)}
                </>
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
