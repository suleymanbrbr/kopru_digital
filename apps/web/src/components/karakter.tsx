import { t, type MessageKey } from '@kopru/i18n';
import Image from 'next/image';

export type KarakterTuru = 'kivilcim' | 'dinamo' | 'sedir';
export type KarakterAsamasi = 1 | 2 | 3 | 4 | 5;

export const karakterAdi = (tur: KarakterTuru): string => t(`karakter.${tur}` as MessageKey);

/** Yol arkadasi yer tutucu cizimi (`public/karakter`, `pnpm hazirla` ile assets'ten kopyalanir). */
export function Karakter({
  tur,
  asama,
  boyut = 160,
  oncelikli = false,
}: {
  tur: KarakterTuru;
  asama: KarakterAsamasi;
  boyut?: number;
  oncelikli?: boolean;
}) {
  return (
    <Image
      src={`/karakter/${tur}-${String(asama)}.svg`}
      alt={t('karakter.gorselAlt', { ad: karakterAdi(tur), asama })}
      width={boyut}
      height={boyut}
      unoptimized
      priority={oncelikli}
      className="select-none"
    />
  );
}
