'use client';

import type { SoruKota } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { Ticket } from 'lucide-react';

import { zamanYaz } from '@/components/hesap/ortak';
import { cn } from '@/lib/cn';
import { kotaOzeti } from '@/lib/soru/soru';

/**
 * Kalan soru hakki. Hak bittiyse sifirlanma zamaniyla acik mesaj verilir. Durum renge dayanmaz:
 * metin her zaman "kaldi" ya da "doldu" der.
 */
export function KotaBilgisi({ kota }: { kota: SoruKota | undefined }) {
  if (!kota) return <div aria-live="polite" className="min-h-11" />;
  const ozet = kotaOzeti(kota);
  if (!ozet) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-metin-ikincil">
        <Ticket className="size-4" aria-hidden />
        {t('soruSor.kota.sinirsiz')}
      </p>
    );
  }
  const doldu = ozet.kalan === 0;
  return (
    <div
      role="status"
      data-testid="kota-bilgisi"
      className={cn(
        'flex items-start gap-3 rounded-orta px-3.5 py-3 text-sm',
        doldu ? 'bg-uyari-yumusak' : 'bg-birincil-yumusak',
      )}
    >
      <Ticket className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">
          {doldu
            ? t(ozet.tur === 'aylik' ? 'soruSor.kota.aylikDoldu' : 'soruSor.kota.gunlukDoldu')
            : t(ozet.tur === 'aylik' ? 'soruSor.kota.aylikKalan' : 'soruSor.kota.gunlukKalan', {
                n: ozet.kalan,
              })}
        </p>
        <p className="text-metin-ikincil">
          {doldu
            ? t('soruSor.kota.sifirlanma', { zaman: zamanYaz(ozet.sifirlanma) })
            : t('soruSor.kota.limit', { n: ozet.limit })}
        </p>
      </div>
    </div>
  );
}
