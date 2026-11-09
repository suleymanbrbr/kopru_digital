import { t } from '@kopru/i18n';
import { View } from 'react-native';

import type { CakisanDers } from '../api/operasyonTipleri';
import { kisaZaman, saatAraligi } from '../lib/saat';
import { Dugme } from '../ui/Dugme';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';

interface Props {
  cakisanlar: readonly CakisanDers[];
  tz: string;
  onayEtiketi: string;
  onayla: () => void;
  vazgec: () => void;
  mesgul?: boolean;
}

/** Ogretmen cakismasi onayi: cakisan dersleri gosterir; onaylaninca `cakisma_onayli: true` gider. */
export function CakismaOnayi({ cakisanlar, tz, onayEtiketi, onayla, vazgec, mesgul }: Props) {
  return (
    <Kart className="gap-3 border-uyari" accessibilityRole="alert" testID="cakisma-onayi">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.ders.cakismaBaslik')}
      </Metin>
      <Metin varyant="ikincil">{t('mobil.ders.cakismaMesaj')}</Metin>
      {cakisanlar.map((c) => (
        <View key={c.id} className="gap-1 rounded-orta bg-yuzeyIkincil p-3">
          <Metin varyant="etiket">{c.baslik ?? t('mobil.ders.adsiz')}</Metin>
          <Metin varyant="ikincil">
            {c.baslangic
              ? `${kisaZaman(c.baslangic, tz)}, ${saatAraligi(c.baslangic, c.bitis, tz)}`
              : ''}
          </Metin>
        </View>
      ))}
      <Dugme etiket={onayEtiketi} varyant="vurgu" yukleniyor={!!mesgul} onPress={onayla} />
      <Dugme etiket={t('mobil.ders.cakismaVazgec')} varyant="hayalet" onPress={vazgec} />
    </Kart>
  );
}
