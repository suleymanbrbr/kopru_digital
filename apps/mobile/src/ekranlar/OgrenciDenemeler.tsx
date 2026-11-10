import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Dugme } from '../ui/Dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '../ui/Durumlar';
import { Ekran } from '../ui/Ekran';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { Secici } from '../ui/Secici';
import { useAktif } from '../uygulama/baglam';
import { hataMesaji } from '../uygulama/hatalar';
import {
  useDenemeGelisim,
  useDenemelerim,
  useDenemeKurallari,
  useOgrenciDenemeAyari,
} from '../uygulama/ogrenme';
import { CevrimdisiSerit } from './CevrimdisiSerit';
import { BolumNetleri, DenemeBaslik, DenemeDurumRozeti } from './DenemeBilesenleri';
import { DenemeGelisimKarti } from './DenemeGelisimKarti';

/** Secilen sinav turunun gelisimi; yukleniyor/hata/bos halleri ile. */
export function GelisimBolumu({
  ogrenciId,
  kuralKodu,
}: {
  ogrenciId: string | undefined;
  kuralKodu: string | null;
}) {
  const sorgu = useDenemeGelisim(ogrenciId, kuralKodu);
  if (!kuralKodu) return null;
  return (
    <>
      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !sorgu.data ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {sorgu.data ? <DenemeGelisimKarti key={kuralKodu} gelisim={sorgu.data} /> : null}
    </>
  );
}

/**
 * Ogrenci "Denemelerim": kendi sonuclari (onay bekliyor / reddedildi + neden), kendi sonucunu gir
 * (kurum ayari aciksa) ve gelisim grafigi. Baskasinin sonucu ve sinif ortalamasi yoktur: tum veri
 * `denemelerim` ve kendi `deneme-gelisim` ucundan gelir.
 */
export function OgrenciDenemeler() {
  const router = useRouter();
  const ogrenciId = useAktif()?.uyelik.uyelikId;
  const sorgu = useDenemelerim();
  const ayar = useOgrenciDenemeAyari();
  const kurallar = useDenemeKurallari();
  const [secilen, setSecilen] = useState<string | null>(null);

  const denemeler = sorgu.data ?? [];
  const onayliKodlar = [
    ...new Set(denemeler.filter((d) => d.onayDurumu === 'onaylandi').map((d) => d.kuralKodu)),
  ];
  const kuralKodu = secilen ?? onayliKodlar[0] ?? null;
  const kuralAdi = (kod: string) => kurallar.data?.find((k) => k.kod === kod)?.ad ?? kod.toUpperCase();

  return (
    <Ekran ust={<CevrimdisiSerit />} kenarlar={['left', 'right', 'bottom']}>
      <Metin varyant="baslik" accessibilityRole="header">
        {t('mobil.ogrenme.deneme.denemelerim')}
      </Metin>
      {ayar.data === true ? (
        <Dugme
          etiket={t('mobil.ogrenme.deneme.sonucGir')}
          onPress={() => {
            router.push('/deneme-gir');
          }}
        />
      ) : null}
      {sorgu.isPending ? <Yukleniyor /> : null}
      {sorgu.isError && !sorgu.data ? (
        <HataDurumu mesaj={hataMesaji(sorgu.error)} tekrar={() => void sorgu.refetch()} />
      ) : null}
      {sorgu.data && denemeler.length === 0 ? (
        <BosDurum
          ikon="sparkles"
          mesaj={
            ayar.data === true
              ? t('mobil.ogrenme.deneme.ogrenciBos')
              : t('mobil.ogrenme.deneme.ogrenciBosGirissiz')
          }
        />
      ) : null}
      {onayliKodlar.length > 1 ? (
        <Secici
          baslik={t('mobil.ogrenme.deneme.tur')}
          deger={kuralKodu}
          onDegis={setSecilen}
          secenekler={onayliKodlar.map((k) => ({ deger: k, etiket: kuralAdi(k) }))}
        />
      ) : null}
      <GelisimBolumu ogrenciId={ogrenciId} kuralKodu={kuralKodu} />
      {denemeler.map((d) => (
        <Kart key={d.id} className="gap-3" testID={`deneme-${d.id}`}>
          <DenemeBaslik deneme={d} />
          <DenemeDurumRozeti durum={d.onayDurumu} />
          {d.onayDurumu === 'reddedildi' ? (
            <View className="gap-1" testID={`red-nedeni-${d.id}`}>
              <Metin varyant="kucuk">{t('mobil.ogrenme.deneme.redNedeniBaslik')}</Metin>
              <Metin>{d.redNedeni ?? t('mobil.ogrenme.deneme.redNedeniYok')}</Metin>
            </View>
          ) : null}
          <BolumNetleri deneme={d} />
        </Kart>
      ))}
    </Ekran>
  );
}
