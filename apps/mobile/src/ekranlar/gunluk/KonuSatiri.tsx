import { t } from '@kopru/i18n';
import { Pressable, View } from 'react-native';

import {
  BANT_EN_AZ_SORU,
  ZORLUKLAR,
  type AnalizZorlugu,
  type Hucre,
  type KonuAnalizi,
} from '../../api/gunlukSoruTipleri';
import {
  bantMetni,
  basariSinifi,
  hucreMetni,
  konuEtiketi,
  yuzdeMetni,
  zorlukAdi,
  type BasariSinifi,
} from '../../gunluk/kurallar';
import { useTema } from '../../tema/TemaSaglayici';
import { Ikon } from '../../ui/Ikon';
import { Metin } from '../../ui/Metin';

/**
 * Hucre gorunumu: renk + yuzde + soru sayisi + ikon + metin (renk tek sinyal degildir).
 * `iyi` yesil, `orta` sari, `zayif` kirmizi; veri yoksa nötr.
 */
const SINIF: Record<
  BasariSinifi,
  {
    kutu: string;
    ikon: 'checkmark-circle' | 'alert-circle' | 'close-circle' | 'remove-circle-outline';
  }
> = {
  iyi: { kutu: 'border-basari bg-basari/15', ikon: 'checkmark-circle' },
  orta: { kutu: 'border-uyari bg-uyari/15', ikon: 'alert-circle' },
  zayif: { kutu: 'border-hata bg-hata/15', ikon: 'close-circle' },
  yok: { kutu: 'border-kenar bg-yuzeyIkincil', ikon: 'remove-circle-outline' },
};

export const SINIF_ADI: Record<BasariSinifi, string> = {
  iyi: 'mobil.gunluk.analiz.sinifIyi',
  orta: 'mobil.gunluk.analiz.sinifOrta',
  zayif: 'mobil.gunluk.analiz.sinifZayif',
  yok: 'mobil.gunluk.analiz.sinifYok',
};

interface HucreProps {
  zorluk: AnalizZorlugu;
  hucre: Hucre;
  secili: boolean;
  zorlaniyor: boolean;
  onAc: () => void;
  testID: string;
}

function HucreDugmesi({ zorluk, hucre, secili, zorlaniyor, onAc, testID }: HucreProps) {
  const { renkler } = useTema();
  const sinif = basariSinifi(hucre.basari);
  const bos = hucre.cozulen === 0;
  const az = !bos && hucre.cozulen < BANT_EN_AZ_SORU;
  const ad = zorlukAdi(zorluk);
  const durum = t(SINIF_ADI[sinif] as 'mobil.gunluk.analiz.sinifYok');
  const etiket = `${ad}: ${hucreMetni(hucre)}${bos ? '' : `, ${durum}`}${az ? `, ${t('mobil.gunluk.analiz.veriAz')}` : ''}${
    zorlaniyor ? `, ${t('mobil.gunluk.analiz.zorlaniyorKisa')}` : ''
  }`;
  const renk =
    sinif === 'iyi'
      ? renkler.basari
      : sinif === 'orta'
        ? renkler.uyari
        : sinif === 'zayif'
          ? renkler.hata
          : renkler.metinIkincil;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bos ? etiket : `${etiket}. ${t('mobil.gunluk.analiz.ayrintiIpucu')}`}
      accessibilityState={{ selected: secili, disabled: bos }}
      disabled={bos}
      testID={testID}
      onPress={onAc}
      className={`min-h-dokunma min-w-24 flex-1 gap-1 rounded-orta border px-2 py-2 active:opacity-80 ${SINIF[sinif].kutu} ${
        secili ? 'border-2' : ''
      } ${zorlaniyor ? 'border-2 border-hata' : ''}`}
    >
      <View className="flex-row items-center gap-1">
        <Ikon ad={SINIF[sinif].ikon} boyut={16} renk={renk} />
        <Metin varyant="kucuk" className="flex-shrink text-metin">
          {ad}
        </Metin>
      </View>
      <Metin varyant="altBaslik" className="text-metin">
        {bos ? '-' : yuzdeMetni(hucre.basari)}
      </Metin>
      <Metin varyant="kucuk" className="text-metin">
        {bos
          ? t('mobil.gunluk.analiz.hucreYok')
          : t('mobil.gunluk.analiz.soruSayisi', { n: hucre.cozulen })}
      </Metin>
      {az ? (
        <Metin varyant="kucuk" className="text-metin">
          {t('mobil.gunluk.analiz.veriAz')}
        </Metin>
      ) : null}
    </Pressable>
  );
}

interface Props {
  konu: KonuAnalizi;
  acik: AnalizZorlugu | 'tum' | null;
  onAc: (zorluk: AnalizZorlugu | 'tum') => void;
}

/**
 * Konu x zorluk satiri: kompakt isi haritasi. Mobilde tablo yerine konu basina bir kart; icinde
 * kolay / orta / zor (ve varsa "belirtilmemis") hucreleri yan yana, dar ekranda ve buyuk yazida
 * alt satira sarar. Dokunulan hucre o konunun kayitlarini acar.
 */
export function KonuSatiri({ konu, acik, onAc }: Props) {
  const zorlaniyor = konu.bant.durum === 'zorlaniyor';
  const bantRengi = zorlaniyor ? 'text-hata' : 'text-metinIkincil';
  const ad = konu.konuAd ?? t('mobil.gunluk.analiz.konuAdsiz');
  return (
    <View
      className={`gap-2 rounded-buyuk border bg-yuzey p-3 ${zorlaniyor ? 'border-hata' : 'border-kenar'}`}
      testID={`konu-satiri-${konu.konuId}`}
    >
      <View
        className="gap-0.5"
        accessible
        accessibilityRole="header"
        accessibilityLabel={konuEtiketi(konu)}
      >
        {konu.ustKonuAd ? <Metin varyant="kucuk">{konu.ustKonuAd}</Metin> : null}
        <View className="flex-row flex-wrap items-baseline justify-between gap-x-2">
          <Metin varyant="altBaslik" className="flex-shrink">
            {ad}
          </Metin>
          <Metin varyant="ikincil">
            {t('mobil.gunluk.analiz.konuToplam', {
              n: konu.toplam.cozulen,
              yuzde: yuzdeMetni(konu.toplam.basari),
            })}
          </Metin>
        </View>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {ZORLUKLAR.map((z) => (
          <HucreDugmesi
            key={z}
            zorluk={z}
            hucre={konu.hucreler[z]}
            secili={acik === z}
            zorlaniyor={konu.bant.bant === z && zorlaniyor}
            testID={`hucre-${konu.konuId}-${z}`}
            onAc={() => {
              onAc(z);
            }}
          />
        ))}
        {konu.hucreler.belirtilmemis.cozulen > 0 ? (
          <HucreDugmesi
            zorluk="belirtilmemis"
            hucre={konu.hucreler.belirtilmemis}
            secili={acik === 'belirtilmemis'}
            zorlaniyor={false}
            testID={`hucre-${konu.konuId}-belirtilmemis`}
            onAc={() => {
              onAc('belirtilmemis');
            }}
          />
        ) : null}
      </View>
      <View className="flex-row items-center gap-1" testID={`bant-${konu.konuId}`}>
        <Ikon
          ad={
            zorlaniyor
              ? 'warning'
              : konu.bant.durum === 'veri_az'
                ? 'hourglass-outline'
                : 'checkmark'
          }
          boyut={16}
        />
        <Metin varyant="etiket" className={`flex-1 ${bantRengi}`}>
          {bantMetni(konu.bant)}
        </Metin>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('mobil.gunluk.analiz.tumKayitlarEtiketi', { konu: ad })}
        accessibilityState={{ selected: acik === 'tum' }}
        testID={`tum-kayitlar-${konu.konuId}`}
        onPress={() => {
          onAc('tum');
        }}
        className="min-h-dokunma flex-row items-center gap-1 active:opacity-80"
      >
        <Ikon ad="list-outline" boyut={16} />
        <Metin varyant="etiket">{t('mobil.gunluk.analiz.tumKayitlar')}</Metin>
      </Pressable>
    </View>
  );
}
