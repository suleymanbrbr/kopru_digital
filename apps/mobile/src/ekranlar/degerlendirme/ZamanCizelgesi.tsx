import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { Degerlendirme } from '../../api/degerlendirmeTipleri';
import { yazarAdi } from '../../degerlendirme/kurallar';
import { tarihGoster } from '../../lib/zaman';
import { Dugme } from '../../ui/Dugme';
import { BosDurum } from '../../ui/Durumlar';
import { Ikon } from '../../ui/Ikon';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { useDegerlendirmeGeriCek } from '../../uygulama/degerlendirme';
import { degerlendirmeHataMesaji } from '../../uygulama/hatalar';
import { DonemSatiri, OlcekListesi } from './DegerlendirmeParcalari';

interface KartProps {
  d: Degerlendirme;
  ogrenciId: string;
  ogrenciAd: string;
  /** Sahip/yonetici baskasinin degerlendirmesini de geri cekebilir. */
  yonetici: boolean;
}

/**
 * Zaman cizelgesinde tek degerlendirme: yazar, donem, olcekler, yorum, "ogrenci goruyor" durumu.
 * Gorunurluk rengin yaninda ikon ve metinle de belirtilir. Geri cekme iki adimlidir (yanlis
 * dokunmaya karsi): onay satiri ayni kartin icinde acilir.
 */
export function DegerlendirmeKarti({ d, ogrenciId, ogrenciAd, yonetici }: KartProps) {
  const router = useRouter();
  const [onay, setOnay] = useState(false);
  const geriCek = useDegerlendirmeGeriCek();
  const geriCekebilir = d.benim || yonetici;
  const gorunurMetin = d.ogrenciGorur
    ? t('mobil.degerlendirme.ogrenciGoruyor')
    : t('mobil.degerlendirme.ogrenciGormuyor');
  return (
    <Kart className="gap-2" testID={`degerlendirme-${d.id}`}>
      <View className="flex-row flex-wrap items-center gap-2">
        <Metin varyant="etiket" className="flex-shrink">
          {yazarAdi(d)}
        </Metin>
        <View
          accessible
          accessibilityLabel={gorunurMetin}
          testID={`degerlendirme-gorunurluk-${d.id}`}
          className={`flex-row items-center gap-1 rounded-tam border px-2 py-1 ${
            d.ogrenciGorur ? 'border-birincil' : 'border-kenar'
          }`}
        >
          <Ikon ad={d.ogrenciGorur ? 'eye-outline' : 'eye-off-outline'} boyut={14} />
          <Metin varyant="kucuk" className="flex-shrink text-metin">
            {gorunurMetin}
          </Metin>
        </View>
      </View>
      <DonemSatiri baslangic={d.donemBaslangic} bitis={d.donemBitis} bransKodu={d.bransKodu} />
      <OlcekListesi olcekler={d.olcekler} />
      {d.yorum ? <Metin>{d.yorum}</Metin> : null}
      <Metin varyant="kucuk">
        {t('mobil.degerlendirme.yazildi', { tarih: tarihGoster(d.olusturma) })}
      </Metin>

      {onay ? (
        <View className="gap-2 border-t border-kenar pt-2" testID={`geri-cek-onay-${d.id}`}>
          <Metin varyant="etiket" accessibilityRole="alert">
            {t('mobil.degerlendirme.geriCekOnay')}
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
              testID={`geri-cek-evet-${d.id}`}
              onPress={() => {
                geriCek.mutate(d.id);
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
          {d.benim && d.duzenlenebilir ? (
            <Dugme
              varyant="ikincil"
              etiket={t('degerlendirme.duzenle')}
              accessibilityLabel={t('mobil.degerlendirme.duzenleEtiketi', { yazar: yazarAdi(d) })}
              testID={`degerlendirme-duzenle-${d.id}`}
              onPress={() => {
                router.push({
                  pathname: '/degerlendirme-yaz',
                  params: { ogrenciId, ad: ogrenciAd, duzelt: d.id },
                });
              }}
            />
          ) : null}
          {geriCekebilir ? (
            <Dugme
              varyant="hayalet"
              etiket={t('degerlendirme.geriCek')}
              accessibilityLabel={t('mobil.degerlendirme.geriCekEtiketi', { yazar: yazarAdi(d) })}
              testID={`degerlendirme-geri-cek-${d.id}`}
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

interface ListeProps {
  liste: readonly Degerlendirme[];
  ogrenciId: string;
  ogrenciAd: string;
  yonetici: boolean;
  dahaVar: boolean;
  dahaFazla: () => void;
  yukleniyor: boolean;
  hata: unknown;
}

/** Degerlendirme zaman cizelgesi (en yeni once) ve "Daha fazla goster". */
export function ZamanCizelgesi({
  liste,
  ogrenciId,
  ogrenciAd,
  yonetici,
  dahaVar,
  dahaFazla,
  yukleniyor,
  hata,
}: ListeProps) {
  return (
    <View className="gap-3" testID="zaman-cizelgesi">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('kocluk.zamanCizelgesi')}
      </Metin>
      {liste.length === 0 ? (
        <Kart>
          <BosDurum
            ikon="create-outline"
            baslik={t('mobil.kocluk.zamanBos')}
            mesaj={t('mobil.kocluk.zamanBosAciklama')}
          />
        </Kart>
      ) : null}
      {liste.map((d) => (
        <DegerlendirmeKarti
          key={d.id}
          d={d}
          ogrenciId={ogrenciId}
          ogrenciAd={ogrenciAd}
          yonetici={yonetici}
        />
      ))}
      {hata ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityRole="alert">
          {degerlendirmeHataMesaji(hata)}
        </Metin>
      ) : null}
      {dahaVar ? (
        <Dugme
          varyant="ikincil"
          etiket={t('mobil.kocluk.dahaFazla')}
          yukleniyor={yukleniyor}
          testID="zaman-daha-fazla"
          onPress={dahaFazla}
        />
      ) : null}
    </View>
  );
}
