import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Dugme } from '../ui/Dugme';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { useServisler } from '../uygulama/baglam';
import { useSaatDilimi } from '../uygulama/operasyon';
import { useGonderimler } from '../uygulama/soru';
import type { Gonderim, GonderimTuru } from '../yukleme/gonderim';
import { gonderimHataMesaji, sifirlanmaMetni, tahminMetni } from './bicim';

function Kart_({ g }: { g: Gonderim }) {
  const router = useRouter();
  const { gonderim, agGozlemcisi } = useServisler();
  const { tz } = useSaatDilimi();
  const cevrimdisi = !agGozlemcisi.cevrimiciMi();
  const surer = g.durum === 'yukleniyor' || g.durum === 'gonderiliyor';
  const hata = g.durum === 'hata';
  const tahmin = g.sonuc?.tahmin;

  const baslik =
    g.tur === 'soru'
      ? g.baslik
      : g.tur === 'cevap'
        ? t('mobil.soru.cevap.baslik')
        : t('mobil.soru.detay.takipSorusu');
  const durumMetni = surer
    ? t('mobil.soru.ogrenci.gonderiliyor')
    : hata
      ? t('mobil.soru.ogrenci.gonderimHata', { neden: gonderimHataMesaji(g.hataKodu) })
      : t('mobil.soru.ogrenci.gonderildi');

  return (
    <Kart
      className={`gap-2 ${hata ? 'border-hata' : ''}`}
      testID={`gonderim-${g.durum}`}
      accessible
      accessibilityLabel={`${baslik}. ${durumMetni}`}
    >
      <View className="flex-row items-center gap-2">
        <Ikon
          ad={hata ? 'alert-circle' : surer ? 'cloud-upload-outline' : 'checkmark-circle'}
          boyut={20}
        />
        <Metin varyant="altBaslik" className="flex-1">
          {baslik}
        </Metin>
      </View>
      <Metin accessibilityLiveRegion="polite" className={hata ? 'text-hata' : ''}>
        {durumMetni}
      </Metin>
      {g.durum === 'yukleniyor' ? (
        <Metin varyant="kucuk">
          {cevrimdisi
            ? t('mobil.soru.ogrenci.gonderimBekliyor')
            : t('mobil.soru.ogrenci.yuklemeSuruyor')}
        </Metin>
      ) : null}
      {hata && g.hataKodu === 'kota_asildi' && g.hataSifirlanma ? (
        <Metin varyant="ikincil">{sifirlanmaMetni(g.hataSifirlanma, tz)}</Metin>
      ) : null}
      {g.durum === 'gonderildi' && g.tur === 'soru' ? (
        <Metin varyant="ikincil" testID="tahmin">
          {tahmin?.hedefMusait === false
            ? t('mobil.soru.ogrenci.ogretmenMusaitDegil')
            : tahmin?.sureSn
              ? t('mobil.soru.ogrenci.tahmin', { sure: tahminMetni(tahmin.sureSn) })
              : t('mobil.soru.ogrenci.tahminYok')}
        </Metin>
      ) : null}
      {hata ? (
        <View className="flex-row gap-2">
          {g.hataKodu !== 'kota_asildi' ? (
            <Dugme
              className="flex-1"
              etiket={t('mobil.soru.ogrenci.yenidenDene')}
              onPress={() => {
                gonderim.yenidenDene(g.id);
              }}
            />
          ) : null}
          <Dugme
            className="flex-1"
            varyant="ikincil"
            etiket={t('mobil.soru.ogrenci.vazgec')}
            onPress={() => {
              void gonderim.vazgec(g.id);
            }}
          />
        </View>
      ) : null}
      {g.durum === 'gonderildi' ? (
        <View className="flex-row gap-2">
          {g.sonuc ? (
            <Dugme
              className="flex-1"
              etiket={t('mobil.soru.ogrenci.gonderimiAc')}
              onPress={() => {
                router.push({
                  pathname: '/(uygulama)/soru/[id]',
                  params: { id: g.sonuc?.soruId ?? '' },
                });
              }}
            />
          ) : null}
          <Dugme
            className="flex-1"
            varyant="ikincil"
            etiket={t('mobil.soru.ogrenci.gonderimTemizle')}
            onPress={() => {
              void gonderim.vazgec(g.id);
            }}
          />
        </View>
      ) : null}
    </Kart>
  );
}

/** Surmekte, hata vermis ve yeni gonderilmis soru/cevap/takip gonderimleri. */
export function GonderimKartlari({ turler }: { turler: readonly GonderimTuru[] }) {
  const liste = useGonderimler().filter((g) => turler.includes(g.tur));
  if (liste.length === 0) return null;
  return (
    <View className="gap-3" testID="gonderimler">
      {[...liste].reverse().map((g) => (
        <Kart_ key={g.id} g={g} />
      ))}
    </View>
  );
}
