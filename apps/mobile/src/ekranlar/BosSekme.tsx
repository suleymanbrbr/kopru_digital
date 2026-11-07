import { t } from '@kopru/i18n';
import type { ComponentProps } from 'react';

import { BosDurum } from '../ui/Durumlar';
import { Ekran } from '../ui/Ekran';
import { Metin } from '../ui/Metin';
import { CevrimdisiSerit } from './CevrimdisiSerit';

type Anahtar = 'dersler' | 'ogrenciler' | 'sorular' | 'gorevler' | 'soruSor';

/** Henuz icerigi olmayan sekmeler icin baslik + bos durum. */
export function BosSekme({
  anahtar,
  ikon,
}: {
  anahtar: Anahtar;
  ikon: ComponentProps<typeof BosDurum>['ikon'];
}) {
  return (
    <>
      <CevrimdisiSerit />
      <Ekran kenarlar={['top', 'left', 'right']}>
        <Metin varyant="baslik" accessibilityRole="header">
          {t(`mobil.${anahtar}.baslik`)}
        </Metin>
        <BosDurum ikon={ikon} mesaj={t(`mobil.${anahtar}.bos`)} />
      </Ekran>
    </>
  );
}
