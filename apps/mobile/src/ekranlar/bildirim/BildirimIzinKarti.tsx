import { t } from '@kopru/i18n';
import { useState } from 'react';
import { View } from 'react-native';

import { izinKartiGorunurMu } from '../../bildirim/yonetici';
import { Dugme } from '../../ui/Dugme';
import { Ikon } from '../../ui/Ikon';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { useAktif, useServisler } from '../../uygulama/baglam';

/**
 * Bildirim izni karti (Bugun). Izin ilk acilista degil, giris + kurum secimi sonrasi, ne icin
 * gerektigi aciklanarak istenir:
 *  - sorulmadiysa: aciklama + "Bildirimleri ac" (sistem izin penceresi) / "Simdi degil" (3 gun gizler);
 *  - reddedildiyse: nazik uyari + "Ayarlari ac" / "Kapat" (14 gun gizler);
 *  - verildiyse hicbir sey cizilmez.
 */
export function BildirimIzinKarti() {
  const { bildirim } = useServisler();
  const aktif = useAktif();
  const durum = bildirim.durum.kullan();
  const [simdi] = useState(() => Date.now());
  const [mesgul, setMesgul] = useState(false);
  if (!aktif || !izinKartiGorunurMu(durum, simdi)) return null;

  const reddedildi = durum.izin === 'reddedildi';
  const personel = aktif.uyelik.rol !== 'ogrenci';
  const baslik = reddedildi
    ? t('mobil.bildirim.izin.reddedildiBaslik')
    : personel
      ? t('mobil.bildirim.izin.baslikPersonel')
      : t('mobil.bildirim.izin.baslik');
  const aciklama = reddedildi
    ? t('mobil.bildirim.izin.reddedildi')
    : personel
      ? t('mobil.bildirim.izin.aciklamaPersonel')
      : t('mobil.bildirim.izin.aciklama');

  return (
    <Kart className="gap-3" testID="bildirim-izin-karti">
      <View className="flex-row items-start gap-3">
        <Ikon ad={reddedildi ? 'notifications-off-outline' : 'notifications-outline'} boyut={28} />
        <View className="flex-1 gap-1">
          <Metin varyant="altBaslik" accessibilityRole="header">
            {baslik}
          </Metin>
          <Metin varyant="ikincil">{aciklama}</Metin>
        </View>
      </View>
      <Dugme
        etiket={reddedildi ? t('mobil.bildirim.izin.ayarlar') : t('mobil.bildirim.izin.ac')}
        yukleniyor={mesgul}
        onPress={() => {
          setMesgul(true);
          void bildirim.izinIste().finally(() => {
            setMesgul(false);
          });
        }}
      />
      <Dugme
        varyant="hayalet"
        etiket={reddedildi ? t('mobil.bildirim.izin.kapat') : t('mobil.bildirim.izin.simdiDegil')}
        onPress={() => {
          bildirim.kartiErtele();
        }}
      />
    </Kart>
  );
}
