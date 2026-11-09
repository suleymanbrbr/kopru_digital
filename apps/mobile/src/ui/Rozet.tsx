import { t } from '@kopru/i18n';
import { View } from 'react-native';

import { rozetDurumu } from '../finans/kurallar';
import { useTema } from '../tema/TemaSaglayici';
import { Ikon } from './Ikon';
import { Metin } from './Metin';

interface Props {
  kalan: number;
  esik: number;
}

/**
 * Kalan ders rozeti. Esik ustunde hicbir sey cizilmez. Renk (sari/kirmizi) tek sinyal degildir:
 * ikon ve metin ("2 ders kaldi" / "Ders kalmadi") her zaman birlikte gosterilir.
 */
export function KalanDersRozeti({ kalan, esik }: Props) {
  const { renkler } = useTema();
  const durum = rozetDurumu(kalan, esik);
  if (durum === 'yok') return null;
  const bitti = durum === 'bitti';
  const metin = bitti ? t('mobil.finans.rozetBitti') : t('mobil.finans.rozetDusuk', { n: kalan });
  return (
    <View
      accessible
      accessibilityLabel={metin}
      testID={`rozet-${durum}`}
      className={`flex-row items-center gap-1 self-start rounded-tam border px-3 py-1 ${
        bitti ? 'border-hata' : 'border-uyari'
      }`}
    >
      <Ikon
        ad={bitti ? 'alert-circle' : 'warning'}
        boyut={14}
        renk={bitti ? renkler.hata : renkler.uyari}
      />
      <Metin varyant="kucuk" className={bitti ? 'text-hata' : 'text-uyari'}>
        {metin}
      </Metin>
    </View>
  );
}
