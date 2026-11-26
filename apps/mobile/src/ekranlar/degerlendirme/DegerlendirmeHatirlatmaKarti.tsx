import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { kisaTarih } from '../../degerlendirme/kurallar';
import { Dugme } from '../../ui/Dugme';
import { KartHatasi, KartYukleniyor } from '../../ui/Durumlar';
import { Ikon } from '../../ui/Ikon';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { useDegerlendirmeHatirlatma } from '../../uygulama/degerlendirme';
import { hataMesaji } from '../../uygulama/hatalar';

/** Kartta en cok gosterilen ogrenci (kalani "N ogrenci daha var" + "Tum ogrenciler"). */
const GOSTER = 4;

/**
 * Ogretmen "Bugun": bu hafta degerlendirmesi olmayan ogrencilerim. Ogrenciye dokununca dogrudan
 * degerlendirme yazma ekrani acilir (kart -> yaz -> kaydet). Kendi sorgusunu yonetir; hata yalniz bu
 * karti etkiler. Hic ogrenci yoksa kart cizilmez.
 */
export function DegerlendirmeHatirlatmaKarti() {
  const router = useRouter();
  const sorgu = useDegerlendirmeHatirlatma();
  const h = sorgu.data;
  if (h?.ogrenciSayisi === 0) return null;
  const gorunen = h?.ogrenciler.slice(0, GOSTER) ?? [];
  return (
    <Kart className="gap-3" testID="degerlendirme-hatirlatma">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('degerlendirme.hatirlatma.baslik')}
      </Metin>
      {sorgu.isPending ? <KartYukleniyor /> : null}
      {sorgu.isError && !h ? (
        <KartHatasi mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {h?.eksikSayisi === 0 ? (
        <Metin testID="degerlendirme-hatirlatma-bos">{t('degerlendirme.hatirlatma.bos')}</Metin>
      ) : null}
      {h && h.eksikSayisi > 0 ? (
        <>
          <Metin accessibilityLiveRegion="polite" testID="degerlendirme-hatirlatma-sayac">
            {t('mobil.degerlendirme.hatirlatmaSayac', {
              sayi: h.ogrenciSayisi,
              eksik: h.eksikSayisi,
            })}
          </Metin>
          <View className="gap-2">
            {gorunen.map((o) => {
              const ad = o.ogrenciAd ?? t('mobil.ogrenciler.adsiz');
              const son = o.sonDegerlendirmeGun
                ? t('degerlendirme.hatirlatma.sonDegerlendirme', {
                    tarih: kisaTarih(o.sonDegerlendirmeGun),
                  })
                : t('degerlendirme.hatirlatma.hicYok');
              return (
                <Pressable
                  key={o.ogrenciId}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('mobil.degerlendirme.hatirlatmaYaz', { ad })}. ${son}`}
                  testID={`hatirlatma-ogrenci-${o.ogrenciId}`}
                  onPress={() => {
                    router.push({
                      pathname: '/degerlendirme-yaz',
                      params: { ogrenciId: o.ogrenciId, ad },
                    });
                  }}
                  className="min-h-dokunma flex-row items-center gap-3 rounded-orta border border-kenar bg-yuzeyIkincil px-4 py-2 active:opacity-80"
                >
                  <View className="flex-1">
                    <Metin varyant="etiket">{ad}</Metin>
                    <Metin varyant="kucuk">{son}</Metin>
                  </View>
                  <Ikon ad="create-outline" boyut={20} />
                </Pressable>
              );
            })}
          </View>
          {h.eksikSayisi > gorunen.length ? (
            <View className="gap-2">
              <Metin varyant="kucuk">
                {t('mobil.degerlendirme.hatirlatmaDahaFazla', {
                  n: h.eksikSayisi - gorunen.length,
                })}
              </Metin>
              <Dugme
                varyant="ikincil"
                etiket={t('mobil.degerlendirme.tumOgrenciler')}
                testID="hatirlatma-tum-ogrenciler"
                onPress={() => {
                  router.navigate('/ogrenciler');
                }}
              />
            </View>
          ) : null}
        </>
      ) : null}
    </Kart>
  );
}
