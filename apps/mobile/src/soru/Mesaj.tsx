import { t } from '@kopru/i18n';
import { useState } from 'react';
import { Image, Pressable, View, useWindowDimensions } from 'react-native';

import type { OkumaAdresi, SoruDetayi, SoruEki, SoruMesaji } from '../api/soruTipleri';
import { cozumle } from '../cizim/model';
import { kisaZaman } from '../lib/saat';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { gorselKaynagi, skiaKaynagi } from './gorsel';
import { GorselGoruntule } from './parcalar';
import { MiniAnlatimOynatici, SesOynatici } from './SesOynatici';

/** Dokunulunca tam ekran acilan fotograf (kucuk/orta adres once, tam boyut tam ekranda). */
export function Kucukresim({
  adres,
  etiket,
  testID,
}: {
  adres: OkumaAdresi | null;
  etiket: string;
  testID?: string;
}) {
  const [acik, setAcik] = useState(false);
  if (!adres) {
    return (
      <View
        className="h-24 items-center justify-center rounded-orta border border-kenar bg-yuzeyIkincil"
        accessibilityLabel={etiket}
      >
        <Ikon ad="image-outline" />
      </View>
    );
  }
  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`${etiket}. ${t('mobil.soru.ek.buyut')}`}
        onPress={() => {
          setAcik(true);
        }}
        testID={testID}
        className="overflow-hidden rounded-orta border border-kenar active:opacity-80"
      >
        <Image
          source={gorselKaynagi(adres.ortaUrl ?? adres.asilUrl)}
          style={{ width: '100%', height: 360, backgroundColor: '#00000020' }}
          resizeMode="contain"
        />
      </Pressable>
      <GorselGoruntule
        adres={adres}
        gorunur={acik}
        kapat={() => {
          setAcik(false);
        }}
      />
    </>
  );
}

function EkSatiri({
  ek,
  mesaj,
  soru,
  genislik,
}: {
  ek: SoruEki;
  mesaj: SoruMesaji;
  soru: SoruDetayi;
  genislik: number;
}) {
  if (ek.tur === 'fotograf') {
    return <Kucukresim adres={ek.adres} etiket={t('mobil.soru.ek.fotograf')} />;
  }
  if (ek.tur === 'ses') {
    // Cizimle birlikte kaydedilmis (mini anlatim) ses, cizim ekinin oynaticisinda calar.
    const miniEsi = mesaj.ekler.some(
      (e) => e.tur === 'cizimli_fotograf' && cozumle(e.cizimVerisi)?.zamanli,
    );
    if (miniEsi) return null;
    if (!ek.adres) return null;
    return <SesOynatici url={ek.adres.asilUrl} sureSn={ek.sureSn ?? ek.adres.sureSn} />;
  }
  // cizimli_fotograf
  const veri = cozumle(ek.cizimVerisi);
  const ses = mesaj.ekler.find((e) => e.tur === 'ses');
  const kaynak = soru.fotograflar.find((f) => f.medyaDosyaId === ek.kaynakDosyaId)?.adres;
  if (veri?.zamanli && ses?.adres && kaynak) {
    return (
      <View className="gap-2" testID="mini-anlatim-eki">
        <Metin varyant="etiket">{t('mobil.soru.ek.miniAnlatim')}</Metin>
        <MiniAnlatimOynatici
          sesUrl={ses.adres.asilUrl}
          gorsel={skiaKaynagi(kaynak.ortaUrl ?? kaynak.asilUrl)}
          oran={veri.oran}
          genislik={genislik}
          cizimVerisi={ek.cizimVerisi}
          sureSn={ses.sureSn ?? ses.adres.sureSn}
        />
      </View>
    );
  }
  return (
    <View className="gap-1">
      <Metin varyant="etiket">{t('mobil.soru.ek.cizimliFotograf')}</Metin>
      <Kucukresim adres={ek.adres} etiket={t('mobil.soru.ek.cizimliFotograf')} />
    </View>
  );
}

/** Ileti dizisindeki tek mesaj: yazar, zaman, metin, "derste konusalim" ve ekler. */
export function MesajKarti({
  mesaj,
  soru,
  tz,
  benimMi,
}: {
  mesaj: SoruMesaji;
  soru: SoruDetayi;
  tz: string;
  /** Mesaji yazan bu kullanici mi ("Sen" etiketi). */
  benimMi: boolean;
}) {
  const { width } = useWindowDimensions();
  const yazar =
    mesaj.yazarRolu === 'ogrenci'
      ? benimMi
        ? t('mobil.soru.detay.yazarOgrenci')
        : (mesaj.yazarAdi ?? '')
      : (mesaj.yazarAdi ?? t('mobil.soru.detay.yazarOgretmen'));
  const tur =
    mesaj.tur === 'soru'
      ? t('mobil.soru.detay.sorunun')
      : mesaj.tur === 'takip'
        ? t('mobil.soru.detay.takipSorusu')
        : t('mobil.soru.detay.cevap');
  return (
    <Kart
      className={`gap-3 ${mesaj.tur === 'cevap' ? 'border-birincil' : ''}`}
      testID={`mesaj-${mesaj.tur}`}
    >
      <View className="flex-row items-center justify-between gap-2">
        <Metin varyant="etiket" accessibilityRole="header">
          {yazar ? `${yazar} · ${tur}` : tur}
        </Metin>
        <Metin varyant="kucuk">{kisaZaman(mesaj.olusturma, tz)}</Metin>
      </View>
      {mesaj.metin ? <Metin>{mesaj.metin}</Metin> : null}
      {mesaj.dersteKonusalim ? (
        <View
          className="flex-row items-center gap-2 rounded-orta bg-yuzeyIkincil p-3"
          testID="derste-konusalim"
        >
          <Ikon ad="people" boyut={18} />
          <Metin className="flex-1">{t('mobil.soru.detay.dersteKonusalim')}</Metin>
        </View>
      ) : null}
      {mesaj.ekler.map((e) => (
        <EkSatiri
          key={e.id}
          ek={e}
          mesaj={mesaj}
          soru={soru}
          genislik={Math.min(width - 64, 520)}
        />
      ))}
    </Kart>
  );
}
