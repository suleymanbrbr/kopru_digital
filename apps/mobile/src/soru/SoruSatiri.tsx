import { t } from '@kopru/i18n';
import { Pressable, View } from 'react-native';

import type { SoruOzeti } from '../api/soruTipleri';
import { kisaZaman } from '../lib/saat';
import { bransAdi } from '../ogrenme/konu';
import { Ikon } from '../ui/Ikon';
import { Metin } from '../ui/Metin';
import { durumAdi } from './bicim';
import { DurumRozeti } from './parcalar';

/**
 * Soru listesi satiri. `ogrencili`: ogretmen listelerinde ogrenci adi baslik olur. Tum satir tek
 * dokunma hedefidir (>= 44 pt); durum rozeti ikon + metindir.
 */
export function SoruSatiri({
  soru,
  tz,
  ogrencili = false,
  onPress,
}: {
  soru: SoruOzeti;
  tz: string;
  ogrencili?: boolean;
  onPress: () => void;
}) {
  const ders = bransAdi(soru.bransKodu);
  const zaman = kisaZaman(soru.sonHareket, tz);
  const metin = soru.onizleme ?? soru.baslik ?? t('mobil.soru.liste.metinsiz');
  const etiket = ogrencili
    ? t('mobil.soru.ogretmen.satirEtiketi', {
        ogrenci: soru.ogrenciAdi ?? '',
        ders,
        durum: durumAdi(soru.durum),
        zaman,
      })
    : t('mobil.soru.liste.satirEtiketi', { ders, durum: durumAdi(soru.durum), metin });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiket}
      onPress={onPress}
      testID={`soru-${soru.id}`}
      className="min-h-dokunma gap-2 rounded-buyuk border border-kenar bg-yuzey p-4 active:opacity-80"
    >
      <View className="flex-row items-center justify-between gap-2">
        <Metin varyant="altBaslik" className="flex-1" numberOfLines={1}>
          {ogrencili ? (soru.ogrenciAdi ?? t('mobil.soru.ogretmen.adsiz')) : ders}
        </Metin>
        <Ikon ad="chevron-forward" boyut={18} />
      </View>
      {ogrencili ? <Metin varyant="etiket">{ders}</Metin> : null}
      <Metin numberOfLines={2}>{metin}</Metin>
      <View className="flex-row flex-wrap items-center gap-2">
        <DurumRozeti durum={soru.durum} />
        <Metin varyant="kucuk">{zaman}</Metin>
        {soru.mesajSayisi > 1 ? (
          <Metin varyant="kucuk">
            {t('mobil.soru.liste.mesajSayisi', { n: soru.mesajSayisi })}
          </Metin>
        ) : null}
      </View>
    </Pressable>
  );
}
