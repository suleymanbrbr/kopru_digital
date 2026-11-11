import type { GeriBildirimDeger } from '@kopru/contracts';
import { t } from '@kopru/i18n';
import { Frown, Meh, Smile, type LucideIcon } from 'lucide-react';

import { Rozet } from '@/components/ui/rozet';

export const DEGER_IKONLARI: Record<GeriBildirimDeger, LucideIcon> = {
  anladim: Smile,
  kismen: Meh,
  anlamadim: Frown,
};

const TONLAR = { anladim: 'basari', kismen: 'uyari', anlamadim: 'hata' } as const;

/** Geri bildirim degeri: renk yanina her zaman ikon ve metin konur. */
export function DegerRozeti({ deger }: { deger: GeriBildirimDeger }) {
  const Ikon = DEGER_IKONLARI[deger];
  return (
    <Rozet ton={TONLAR[deger]} className="gap-1">
      <Ikon className="size-3.5" aria-hidden />
      {t(`kayitGeriBildirim.geriBildirim.deger.${deger}`)}
    </Rozet>
  );
}
