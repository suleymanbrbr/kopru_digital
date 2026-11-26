import { t } from '@kopru/i18n';
import { View } from 'react-native';

import { Dugme } from '../../ui/Dugme';
import { Ikon } from '../../ui/Ikon';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { useServisler } from '../../uygulama/baglam';
import { useGunlukGonderimleri } from '../../uygulama/gunluk';
import { kuyrukHataMesaji } from '../../uygulama/hatalar';
import type { Gonderim } from '../../yukleme/gonderim';

function GonderimKarti({ g }: { g: Gonderim }) {
  const { gonderim, agGozlemcisi } = useServisler();
  const hata = g.durum === 'hata';
  const cevrimdisi = !agGozlemcisi.cevrimiciMi();
  const govde = g.govde.tur === 'gunluk_soru' ? g.govde : null;
  const durumMetni = hata
    ? t('mobil.gunluk.gonderim.hata', { neden: kuyrukHataMesaji(g.hataKodu) })
    : cevrimdisi
      ? t('mobil.gunluk.gonderim.cevrimdisi')
      : t('mobil.gunluk.gonderim.gonderiliyor');
  const ozet = govde
    ? t('mobil.gunluk.gonderim.ozet', {
        konu: g.baslik,
        soru: govde.dogru + govde.yanlis + govde.bos,
      })
    : g.baslik;
  return (
    <Kart
      className={`gap-2 ${hata ? 'border-hata' : ''}`}
      testID={`gunluk-gonderim-${g.durum}`}
      accessible
      accessibilityLabel={`${ozet}. ${durumMetni}`}
    >
      <View className="flex-row items-center gap-2">
        <Ikon ad={hata ? 'alert-circle' : 'cloud-upload-outline'} boyut={20} />
        <Metin varyant="altBaslik" className="flex-1">
          {ozet}
        </Metin>
      </View>
      <Metin accessibilityLiveRegion="polite" className={hata ? 'text-hata' : ''}>
        {durumMetni}
      </Metin>
      {hata ? (
        <View className="flex-row gap-2">
          <Dugme
            className="flex-1"
            etiket={t('mobil.gunluk.gonderim.yenidenDene')}
            onPress={() => {
              gonderim.yenidenDene(g.id);
            }}
          />
          <Dugme
            className="flex-1"
            varyant="ikincil"
            etiket={t('mobil.gunluk.gonderim.vazgec')}
            onPress={() => {
              void gonderim.vazgec(g.id);
            }}
          />
        </View>
      ) : null}
    </Kart>
  );
}

/**
 * Henüz sunucuya ulaşmamış (yükleniyor, gönderiliyor, bağlantı bekliyor) ya da hata vermiş günlük
 * soru kayıtları. Gönderilenler listeden düşer: kayıt "Kayıtlarım"da sunucudan görünür.
 */
export function GunlukGonderimKartlari() {
  const liste = useGunlukGonderimleri().filter((g) => g.durum !== 'gonderildi');
  if (liste.length === 0) return null;
  return (
    <View className="gap-3" testID="gunluk-gonderimler">
      {liste.map((g) => (
        <GonderimKarti key={g.id} g={g} />
      ))}
    </View>
  );
}
