import { t } from '@kopru/i18n';
import { useState } from 'react';
import { View } from 'react-native';

import type { OgrenciDegerlendirmesi } from '../../api/degerlendirmeTipleri';
import { tarihGoster } from '../../lib/zaman';
import { Cip } from '../../ui/Cip';
import { Dugme } from '../../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Ekran } from '../../ui/Ekran';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { useDegerlendirmelerim, useKaynakOnerilerim } from '../../uygulama/degerlendirme';
import { hataMesaji } from '../../uygulama/hatalar';
import { CevrimdisiSerit } from '../CevrimdisiSerit';
import { DonemSatiri, OlcekListesi } from './DegerlendirmeParcalari';
import { OneriKarti } from './OneriKarti';

export type OgretmenimBolumu = 'oneriler' | 'degerlendirmeler';

/**
 * Ogrencinin bakisi: degerlendirme YALNIZ ogretmenin "ogrenci gorsun" dedigi kayitlar olarak gelir
 * ve bu kart yazar kimligini, gorunurluk durumunu ya da baska ogretmenlerin gizli yorumlarini
 * gostermek icin gerekli alanlari tip duzeyinde tasimaz.
 */
function OgrenciDegerlendirmeKarti({ d }: { d: OgrenciDegerlendirmesi }) {
  return (
    <Kart className="gap-2" testID={`benim-degerlendirme-${d.id}`}>
      <Metin varyant="etiket">
        {(d.yazarAd?.trim() ?? '') === '' ? t('mobil.degerlendirme.eskiOgretmen') : d.yazarAd}
      </Metin>
      <DonemSatiri baslangic={d.donemBaslangic} bitis={d.donemBitis} bransKodu={d.bransKodu} />
      <OlcekListesi olcekler={d.olcekler} />
      {d.yorum ? <Metin>{d.yorum}</Metin> : null}
      <Metin varyant="kucuk">
        {t('mobil.degerlendirme.yazildi', { tarih: tarihGoster(d.olusturma) })}
      </Metin>
    </Kart>
  );
}

function Oneriler() {
  const sorgu = useKaynakOnerilerim();
  return (
    <View className="gap-3" testID="ogretmenim-oneriler">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('kaynakOnerisi.ogrenciSayfasi')}
      </Metin>
      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !sorgu.data ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {sorgu.data?.length === 0 ? (
        <Kart>
          <BosDurum
            ikon="book-outline"
            baslik={t('kaynakOnerisi.bos')}
            mesaj={t('mobil.kocluk.ogrenciOneriBosAciklama')}
          />
        </Kart>
      ) : null}
      {sorgu.data?.map((o) => (
        <OneriKarti key={o.id} o={o} gorunum="ogrenci" />
      ))}
    </View>
  );
}

function Degerlendirmeler() {
  const sorgu = useDegerlendirmelerim();
  const liste = sorgu.data?.pages.flatMap((s) => s.degerlendirmeler) ?? [];
  return (
    <View className="gap-3" testID="ogretmenim-degerlendirmeler">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('degerlendirme.ogrenciSayfasi.baslik')}
      </Metin>
      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !sorgu.data ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {sorgu.data && liste.length === 0 ? (
        <Kart>
          <BosDurum ikon="chatbubbles-outline" mesaj={t('degerlendirme.ogrenciSayfasi.bos')} />
        </Kart>
      ) : null}
      {liste.map((d) => (
        <OgrenciDegerlendirmeKarti key={d.id} d={d} />
      ))}
      {sorgu.hasNextPage ? (
        <Dugme
          varyant="ikincil"
          etiket={t('mobil.kocluk.dahaFazla')}
          yukleniyor={sorgu.isFetchingNextPage}
          testID="benim-daha-fazla"
          onPress={() => void sorgu.fetchNextPage()}
        />
      ) : null}
    </View>
  );
}

/** Ogrenci "Ogretmenim": onerilen kaynaklar ve kendisine gorunur degerlendirmeler. */
export function OgretmenimEkrani({ bolum }: { bolum?: OgretmenimBolumu }) {
  const [secili, setSecili] = useState<OgretmenimBolumu>(bolum ?? 'oneriler');
  return (
    <Ekran ust={<CevrimdisiSerit />} kenarlar={['left', 'right', 'bottom']}>
      <Metin varyant="baslik" accessibilityRole="header">
        {t('mobil.ogretmenim.baslik')}
      </Metin>
      <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
        <Cip
          etiket={t('kaynakOnerisi.ogrenciSayfasi')}
          secili={secili === 'oneriler'}
          testID="ogretmenim-sekme-oneriler"
          onPress={() => {
            setSecili('oneriler');
          }}
        />
        <Cip
          etiket={t('mobil.ogretmenim.degerlendirmeler')}
          secili={secili === 'degerlendirmeler'}
          testID="ogretmenim-sekme-degerlendirmeler"
          onPress={() => {
            setSecili('degerlendirmeler');
          }}
        />
      </View>
      {secili === 'oneriler' ? <Oneriler /> : <Degerlendirmeler />}
    </Ekran>
  );
}
