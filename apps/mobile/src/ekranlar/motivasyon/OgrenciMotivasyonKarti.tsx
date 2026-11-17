import { t } from '@kopru/i18n';
import { View } from 'react-native';

import { apiHatasiMi } from '../../api/tipler';
import { seriBasligi } from '../../motivasyon/seriMetni';
import { Yukleniyor } from '../../ui/Durumlar';
import { Ikon } from '../../ui/Ikon';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { useOgrenciMotivasyonOzeti, useOyunlastirmaAcik } from '../../uygulama/motivasyon';
import { BeceriRadari } from './BeceriRadari';
import { SeviyeCubugu } from './KarakterSahnesi';

/**
 * Personelin ogrenci kartindaki motivasyon ozeti: seviye, beceri grafigi, seri, rozet sayisi.
 * Modul kapaliysa ya da ogrenci kapsam disindaysa (404/403) hicbir sey cizmez.
 */
export function OgrenciMotivasyonKarti({ ogrenciId }: { ogrenciId: string }) {
  const acik = useOyunlastirmaAcik();
  const q = useOgrenciMotivasyonOzeti(ogrenciId);
  if (!acik) return null;
  if (q.isPending) return <Yukleniyor />;
  if (q.isError) {
    // Kapsam disi / modul kapali: sessizce gizle; diger hatalarda kisa not.
    if (apiHatasiMi(q.error) && ['bulunamadi', 'modul_kapali', 'izin_yok'].includes(q.error.kod)) {
      return null;
    }
    return (
      <Kart>
        <Metin varyant="ikincil">{t('mobil.motivasyon.ozet.yuklenemedi')}</Metin>
      </Kart>
    );
  }
  const d = q.data;
  return (
    <Kart className="gap-3" testID="ogrenci-motivasyon">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.motivasyon.ozet.baslik')}
      </Metin>
      <SeviyeCubugu durum={d} />
      <View
        className="flex-row flex-wrap gap-x-5 gap-y-2"
        accessible
        accessibilityLabel={`${seriBasligi(d.seri.mevcut_seri)}. ${t('mobil.motivasyon.ozet.rozetSayisi', { n: d.rozetler.kazanilan.length })}`}
      >
        <View className="flex-row items-center gap-1">
          <Ikon ad="flame" renk={d.seri.mevcut_seri > 0 ? '#FF8A3D' : undefined} />
          <Metin varyant="etiket">{seriBasligi(d.seri.mevcut_seri)}</Metin>
        </View>
        <View className="flex-row items-center gap-1">
          <Ikon ad="ribbon" />
          <Metin varyant="etiket">
            {t('mobil.motivasyon.ozet.rozetSayisi', { n: d.rozetler.kazanilan.length })}
          </Metin>
        </View>
      </View>
      <BeceriRadari beceriler={d.beceriler} boyut={180} />
    </Kart>
  );
}
