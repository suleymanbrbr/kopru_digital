import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import type { KaynakOnerisi } from '../../api/degerlendirmeTipleri';
import {
  basladiDurumu,
  guvenliBaglanti,
  oneriBasligi,
  oneridenFormParametreleri,
} from '../../degerlendirme/kurallar';
import { tarihGoster } from '../../lib/zaman';
import { bransAdi } from '../../ogrenme/konu';
import { Dugme } from '../../ui/Dugme';
import { Ikon } from '../../ui/Ikon';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { useKaynakOneriGeriCek } from '../../uygulama/degerlendirme';
import { degerlendirmeHataMesaji } from '../../uygulama/hatalar';

/** "Basladi" durumu: renk tek sinyal degildir (ikon + metin). `link` icin gosterilmez (olculemez). */
function BasladiRozeti({ o }: { o: KaynakOnerisi }) {
  const d = basladiDurumu(o.basladi);
  const basladi = d.anahtar === 'basladi';
  const metin =
    basladi && o.kayitSayisi > 0
      ? `${d.metin} · ${t('mobil.kocluk.kayitSayisi', { n: o.kayitSayisi })}`
      : d.metin;
  return (
    <View
      accessible
      accessibilityLabel={metin}
      testID={`oneri-durum-${o.id}`}
      className={`flex-row items-center gap-1 self-start rounded-tam border px-2 py-1 ${
        basladi ? 'border-birincil' : 'border-kenar'
      }`}
    >
      <Ikon
        ad={
          basladi
            ? 'checkmark-circle-outline'
            : d.anahtar === 'olculemez'
              ? 'link-outline'
              : 'time-outline'
        }
        boyut={14}
      />
      <Metin varyant="kucuk" className="flex-shrink text-metin">
        {metin}
      </Metin>
    </View>
  );
}

interface Props {
  o: KaynakOnerisi;
  /** Ogrenci gorunumu: "Soru cozdum" eylemi; personel gorunumu: geri cekme ve "Basladi" durumu. */
  gorunum: 'personel' | 'ogrenci';
  /** Personel: sahip/yonetici baskasinin onerisini de geri cekebilir. */
  yonetici?: boolean;
}

/** Onerilen kaynak karti (personel koclugu ve ogrencinin "Ogretmenimin onerdikleri" listesi). */
export function OneriKarti({ o, gorunum, yonetici = false }: Props) {
  const router = useRouter();
  const [onay, setOnay] = useState(false);
  const geriCek = useKaynakOneriGeriCek();
  const baslik = oneriBasligi(o);
  const url = guvenliBaglanti(o.baglantiUrl);
  const formParametreleri = oneridenFormParametreleri(o);
  const ders = [o.bransKodu ? bransAdi(o.bransKodu) : null, o.konuAd].filter(Boolean).join(' · ');
  return (
    <Kart className="gap-2" testID={`oneri-${o.id}`}>
      <View className="flex-row flex-wrap items-center gap-2">
        <Ikon
          ad={
            o.tur === 'link'
              ? 'link-outline'
              : o.tur === 'serbest'
                ? 'document-text-outline'
                : 'book-outline'
          }
          boyut={18}
        />
        <Metin varyant="etiket" className="flex-1 flex-shrink">
          {baslik}
        </Metin>
      </View>
      <Metin varyant="kucuk">{t(`kaynakOnerisi.tur.${o.tur}`)}</Metin>
      {ders ? <Metin varyant="ikincil">{ders}</Metin> : null}
      {o.notMetni ? <Metin>{o.notMetni}</Metin> : null}
      <Metin varyant="kucuk">
        {o.onerenAd
          ? t('mobil.kocluk.onerenTarih', { ad: o.onerenAd, tarih: tarihGoster(o.olusturma) })
          : t('mobil.kocluk.onerenYokTarih', { tarih: tarihGoster(o.olusturma) })}
      </Metin>
      {gorunum === 'personel' || o.tur !== 'link' ? <BasladiRozeti o={o} /> : null}

      {onay ? (
        <View className="gap-2 border-t border-kenar pt-2" testID={`oneri-geri-cek-onay-${o.id}`}>
          <Metin varyant="etiket" accessibilityRole="alert">
            {t('mobil.kocluk.oneriGeriCekOnay')}
          </Metin>
          {geriCek.isError ? (
            <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
              {degerlendirmeHataMesaji(geriCek.error)}
            </Metin>
          ) : null}
          <View className="flex-row flex-wrap gap-2">
            <Dugme
              varyant="tehlike"
              etiket={t('mobil.degerlendirme.geriCekEvet')}
              yukleniyor={geriCek.isPending}
              testID={`oneri-geri-cek-evet-${o.id}`}
              onPress={() => {
                geriCek.mutate(o.id);
              }}
            />
            <Dugme
              varyant="ikincil"
              etiket={t('mobil.degerlendirme.vazgec')}
              onPress={() => {
                setOnay(false);
                geriCek.reset();
              }}
            />
          </View>
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {gorunum === 'ogrenci' && formParametreleri ? (
            <Dugme
              etiket={t('kaynakOnerisi.gunlukKayitta')}
              accessibilityLabel={t('mobil.kocluk.soruCozdumEtiketi', { kaynak: baslik })}
              testID={`oneri-soru-cozdum-${o.id}`}
              onPress={() => {
                router.push({ pathname: '/gunluk-soru-yeni', params: formParametreleri });
              }}
            />
          ) : null}
          {url ? (
            <Dugme
              varyant="ikincil"
              etiket={t('mobil.kocluk.baglantiyiAc')}
              accessibilityLabel={t('mobil.kocluk.baglantiyiAcEtiketi', { kaynak: baslik })}
              testID={`oneri-baglanti-${o.id}`}
              onPress={() => {
                void Linking.openURL(url).catch(() => undefined);
              }}
            />
          ) : null}
          {gorunum === 'personel' && (o.benim || yonetici) ? (
            <Dugme
              varyant="hayalet"
              etiket={t('degerlendirme.geriCek')}
              accessibilityLabel={t('mobil.kocluk.oneriGeriCekEtiketi', { kaynak: baslik })}
              testID={`oneri-geri-cek-${o.id}`}
              onPress={() => {
                setOnay(true);
              }}
            />
          ) : null}
        </View>
      )}
    </Kart>
  );
}
