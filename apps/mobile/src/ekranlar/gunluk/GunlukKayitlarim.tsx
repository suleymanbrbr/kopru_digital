import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { GunlukKayit } from '../../api/gunlukSoruTipleri';
import { zorlukAdi } from '../../gunluk/kurallar';
import { tarihGoster } from '../../lib/zaman';
import { bransAdi } from '../../ogrenme/konu';
import { Dugme } from '../../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ekran } from '../../ui/Ekran';
import { Ikon } from '../../ui/Ikon';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { useGunlukKayitlarim, useKayitSil } from '../../uygulama/gunluk';
import { hataMesaji } from '../../uygulama/hatalar';
import { CevrimdisiSerit } from '../CevrimdisiSerit';
import { GunlukGonderimKartlari } from './GunlukGonderimKartlari';

export function kayitKaynagi(k: GunlukKayit): string | null {
  return k.kaynakMetin ?? (k.kaynakTestId ? t('mobil.gunluk.kayit.kitapTesti') : null);
}

function KayitKarti({ k }: { k: GunlukKayit }) {
  const router = useRouter();
  const sil = useKayitSil();
  const [onay, setOnay] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const ad = k.konuAd ?? bransAdi(k.bransKodu);
  const ozet = t('mobil.gunluk.kayit.ozet', {
    dogru: k.dogru,
    yanlis: k.yanlis,
    bos: k.bos,
    toplam: k.toplam,
  });
  const kaynak = kayitKaynagi(k);
  return (
    <Kart className="gap-2" testID={`gunluk-kayit-${k.id}`} accessible={false}>
      <View
        className="gap-1"
        accessible
        accessibilityLabel={`${ad}, ${bransAdi(k.bransKodu)}, ${zorlukAdi(k.zorluk)}. ${ozet}${
          k.dosyalar.length > 0
            ? `. ${t('mobil.gunluk.kayit.fotograf', { n: k.dosyalar.length })}`
            : ''
        }`}
      >
        <Metin varyant="altBaslik">{ad}</Metin>
        <Metin varyant="ikincil">
          {bransAdi(k.bransKodu)} · {zorlukAdi(k.zorluk)}
        </Metin>
        <Metin testID={`gunluk-kayit-ozet-${k.id}`}>{ozet}</Metin>
        {kaynak ? <Metin varyant="kucuk">{kaynak}</Metin> : null}
        {k.dosyalar.length > 0 ? (
          <View className="flex-row items-center gap-1">
            <Ikon ad="image-outline" boyut={14} />
            <Metin varyant="kucuk">
              {t('mobil.gunluk.kayit.fotograf', { n: k.dosyalar.length })}
            </Metin>
          </View>
        ) : null}
      </View>
      {hata ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
          {hata}
        </Metin>
      ) : null}
      {k.duzenlenebilir ? (
        onay ? (
          <View className="gap-2" testID={`gunluk-sil-onay-${k.id}`}>
            <Metin varyant="etiket">{t('mobil.gunluk.kayit.silOnay')}</Metin>
            <View className="flex-row gap-2">
              <Dugme
                className="flex-1"
                varyant="tehlike"
                etiket={t('mobil.gunluk.kayit.silEvet')}
                yukleniyor={sil.isPending}
                testID={`gunluk-sil-evet-${k.id}`}
                onPress={() => {
                  setHata(null);
                  sil.mutate(k.id, {
                    onError: (e) => {
                      setOnay(false);
                      setHata(hataMesaji(e));
                    },
                  });
                }}
              />
              <Dugme
                className="flex-1"
                varyant="ikincil"
                etiket={t('ortak.vazgec')}
                onPress={() => {
                  setOnay(false);
                }}
              />
            </View>
          </View>
        ) : (
          <View className="flex-row gap-2">
            <Dugme
              className="flex-1"
              varyant="ikincil"
              etiket={t('mobil.gunluk.kayit.duzelt')}
              testID={`gunluk-duzelt-${k.id}`}
              accessibilityLabel={`${t('mobil.gunluk.kayit.duzelt')}: ${ad}`}
              onPress={() => {
                router.push({ pathname: '/gunluk-soru-yeni', params: { duzelt: k.id } });
              }}
            />
            <Dugme
              className="flex-1"
              varyant="ikincil"
              etiket={t('mobil.gunluk.kayit.sil')}
              testID={`gunluk-sil-${k.id}`}
              accessibilityLabel={`${t('mobil.gunluk.kayit.sil')}: ${ad}`}
              onPress={() => {
                setOnay(true);
              }}
            />
          </View>
        )
      ) : null}
    </Kart>
  );
}

/** Ogrenci "Kayitlarim": son 30 gunun kayitlari; yalniz bugunku kayitlar duzeltilir/silinir. */
export function GunlukKayitlarim() {
  const router = useRouter();
  const sorgu = useGunlukKayitlarim({});
  const kayitlar = sorgu.data?.pages.flatMap((s) => s.kayitlar) ?? [];
  const gunler: { gun: string; kayitlar: GunlukKayit[] }[] = [];
  for (const k of kayitlar) {
    const son = gunler[gunler.length - 1];
    if (son?.gun === k.gun) son.kayitlar.push(k);
    else gunler.push({ gun: k.gun, kayitlar: [k] });
  }
  return (
    <Ekran ust={<CevrimdisiSerit />} kenarlar={['left', 'right', 'bottom']}>
      <Dugme
        buyuk
        etiket={t('mobil.gunluk.bugun.soruCozdum')}
        testID="gunluk-yeni"
        onPress={() => {
          router.push('/gunluk-soru-yeni');
        }}
      />
      <Dugme
        varyant="ikincil"
        etiket={t('mobil.gunluk.bugun.analizim')}
        testID="gunluk-analizim"
        onPress={() => {
          router.push('/konu-analizi');
        }}
      />
      <Dugme
        varyant="ikincil"
        etiket={t('mobil.gunluk.kitap.baslik')}
        testID="gunluk-kitaplarim"
        onPress={() => {
          router.push('/kaynak-kitaplar');
        }}
      />
      <GunlukGonderimKartlari />
      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !sorgu.data ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {sorgu.data && kayitlar.length === 0 ? (
        <BosDurum ikon="create-outline" mesaj={t('mobil.gunluk.kayit.bos')} />
      ) : null}
      {gunler.map((g) => (
        <View key={g.gun} className="gap-3" testID={`gunluk-gun-${g.gun}`}>
          <Metin varyant="etiket" accessibilityRole="header">
            {tarihGoster(g.gun)}
          </Metin>
          {g.kayitlar.map((k) => (
            <KayitKarti key={k.id} k={k} />
          ))}
        </View>
      ))}
      {sorgu.hasNextPage ? (
        <Dugme
          varyant="ikincil"
          etiket={t('mobil.gunluk.kayit.dahaFazla')}
          yukleniyor={sorgu.isFetchingNextPage}
          onPress={() => void sorgu.fetchNextPage()}
        />
      ) : null}
    </Ekran>
  );
}
