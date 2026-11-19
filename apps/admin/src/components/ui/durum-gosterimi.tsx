'use client';

import { t } from '@kopru/i18n';

import { Dugme } from './dugme';
import { Uyari } from './uyari';

import { hataMetni } from '@/lib/hata';

/** Sorgu yuklenirken / hata verdiginde ortak gosterim. */
export function Yukleniyor({ etiket }: { etiket?: string }) {
  return (
    <p role="status" className="py-6 text-sm text-metin-ikincil">
      {etiket ?? t('yonetim.ortak.yukleniyor')}
    </p>
  );
}

export function SorguHatasi({ hata, onTekrar }: { hata: unknown; onTekrar?: () => void }) {
  return (
    <Uyari ton="hata" baslik={t('yonetim.ortak.yuklenemedi')}>
      <p>{hataMetni(hata)}</p>
      {onTekrar ? (
        <Dugme gorunum="ikincil" boyut="sm" className="mt-2" onClick={onTekrar}>
          {t('yonetim.ortak.tekrarDene')}
        </Dugme>
      ) : null}
    </Uyari>
  );
}

export function BosDurum({ children }: { children: string }) {
  return <p className="py-8 text-center text-sm text-metin-ikincil">{children}</p>;
}
