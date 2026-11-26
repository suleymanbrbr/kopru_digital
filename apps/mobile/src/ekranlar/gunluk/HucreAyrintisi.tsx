import { t } from '@kopru/i18n';
import { Image, View } from 'react-native';

import type { AnalizSorgusu, AnalizZorlugu } from '../../api/gunlukSoruTipleri';
import { zorlukAdi } from '../../gunluk/kurallar';
import { tarihGoster } from '../../lib/zaman';
import { gorselKaynagi } from '../../soru/gorsel';
import { Dugme } from '../../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ikon } from '../../ui/Ikon';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { useHucreDetayi } from '../../uygulama/gunluk';
import { hataMesaji } from '../../uygulama/hatalar';

interface Props {
  sorgu: AnalizSorgusu;
  konuId: string;
  konuAd: string;
  zorluk: AnalizZorlugu | 'tum';
  ogrenciId?: string;
  kapat: () => void;
}

/** Bir hucrenin (konu x zorluk) ya da konunun tum kayitlari ve fotograflari. */
export function HucreAyrintisi({ sorgu, konuId, konuAd, zorluk, ogrenciId, kapat }: Props) {
  const detay = useHucreDetayi(
    { ...sorgu, konuId, ...(zorluk !== 'tum' ? { zorluk } : {}) },
    ogrenciId,
  );
  const baslik =
    zorluk === 'tum'
      ? t('mobil.gunluk.analiz.ayrintiTum', { konu: konuAd })
      : t('mobil.gunluk.analiz.ayrintiHucre', { konu: konuAd, zorluk: zorlukAdi(zorluk) });
  return (
    <Kart className="gap-3 border-birincil" testID="hucre-ayrintisi">
      <View className="flex-row items-center gap-2">
        <Metin varyant="altBaslik" accessibilityRole="header" className="flex-1">
          {baslik}
        </Metin>
        <Dugme varyant="ikincil" etiket={t('ortak.kapat')} onPress={kapat} testID="ayrinti-kapat" />
      </View>
      {detay.isPending ? <Yukleniyor /> : null}
      {detay.isError && !detay.data ? (
        <HataDurumu mesaj={hataMesaji(detay.error)} tekrar={() => void detay.refetch()} />
      ) : null}
      {detay.data?.kayitlar.length === 0 ? (
        <BosDurum ikon="document-outline" mesaj={t('mobil.gunluk.analiz.ayrintiBos')} />
      ) : null}
      {detay.data?.fotografAdresleriAlinamadi ? (
        <View className="gap-2" testID="foto-adresleri-alinamadi">
          <Metin varyant="ikincil" className="text-hata">
            {t('mobil.gunluk.analiz.fotoAlinamadi')}
          </Metin>
          <Dugme
            varyant="ikincil"
            etiket={t('ortak.tekrarDene')}
            onPress={() => void detay.refetch()}
          />
        </View>
      ) : null}
      {detay.data?.kayitlar.map((k) => (
        <View
          key={`${k.kaynak}-${k.id}`}
          className="gap-1 border-t border-kenar pt-2"
          testID={`ayrinti-kayit-${k.id}`}
        >
          <Metin varyant="etiket">
            {tarihGoster(k.gun)} · {zorlukAdi(k.zorluk)}
            {k.kaynak === 'odev' ? ` · ${t('mobil.gunluk.analiz.odevTeslimi')}` : ''}
          </Metin>
          <Metin>
            {t('mobil.gunluk.kayit.ozet', {
              dogru: k.dogru,
              yanlis: k.yanlis,
              bos: k.bos,
              toplam: k.toplam,
            })}
          </Metin>
          {k.kaynakAdi ? <Metin varyant="kucuk">{k.kaynakAdi}</Metin> : null}
          {k.dosyalar.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {k.dosyalar.map((d, i) =>
                d.adres ? (
                  <Image
                    key={d.medyaDosyaId}
                    source={gorselKaynagi(d.adres)}
                    accessibilityLabel={t('mobil.gunluk.analiz.fotoEtiketi', { n: i + 1 })}
                    className="h-24 w-24 rounded-orta bg-yuzeyIkincil"
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    key={d.medyaDosyaId}
                    className="h-24 w-24 items-center justify-center rounded-orta bg-yuzeyIkincil"
                  >
                    <Ikon ad="image-outline" boyut={24} />
                  </View>
                ),
              )}
            </View>
          ) : null}
        </View>
      ))}
    </Kart>
  );
}
