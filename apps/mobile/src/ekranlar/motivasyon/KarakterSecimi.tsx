import { t } from '@kopru/i18n';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { KarakterTuru } from '../../api/motivasyonTipleri';
import { Companion } from '../../karakter/Companion';
import type { TurKodu } from '../../karakter/tipler';
import { Dugme } from '../../ui/Dugme';
import { HataDurumu, Yukleniyor } from '../../ui/Durumlar';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { MetinGirdisi } from '../../ui/MetinGirdisi';
import { hataMesaji } from '../../uygulama/hatalar';
import { useKarakterIslemleri, useKarakterTurleri } from '../../uygulama/motivasyon';

const TUR_KODLARI: readonly string[] = ['kivilcim', 'dinamo', 'sedir'];
const turKodu = (k: string): TurKodu => (TUR_KODLARI.includes(k) ? (k as TurKodu) : 'kivilcim');

interface Props {
  /** `ilk`: ad + tur (ilk acilis). `tur`: yalniz tur degistirme (tek sefer). */
  mod: 'ilk' | 'tur';
  mevcutTur?: string;
  /** Basarili secimden sonra. */
  bitti: () => void;
  /** Ilk acilista "Sonra" ile gecilebilir. */
  vazgec?: () => void;
}

/**
 * Karakter secimi: 3 tur, secili turun asama onizlemesi (5 asama) ve ad. Uygunsuz ad sunucudan
 * 422 `karakter_adi_uygunsuz` ile gelir ve anlasilir bir mesajla gosterilir. Tur degistirme hakki
 * tek seferliktir (onaydan once uyarilir).
 */
export function KarakterSecimi({ mod, mevcutTur, bitti, vazgec }: Props) {
  const turler = useKarakterTurleri();
  const { sec, tur: turDegistir } = useKarakterIslemleri();
  const [secili, setSecili] = useState<string>(mod === 'tur' ? '' : 'kivilcim');
  const [ad, setAd] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  const secilen: KarakterTuru | undefined = turler.data?.find((x) => x.kod === secili);
  const adGecerli = ad.trim().length >= 1 && ad.trim().length <= 24;
  const gonderilebilir =
    !!secilen && (mod === 'tur' ? secili !== mevcutTur : adGecerli) && !bekliyor;

  async function onayla() {
    if (!secilen) return;
    setHata(null);
    setBekliyor(true);
    try {
      if (mod === 'ilk') await sec.mutateAsync({ turKodu: secilen.kod, ad: ad.trim() });
      else await turDegistir.mutateAsync(secilen.kod);
      bitti();
    } catch (e) {
      setHata(hataMesaji(e));
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <View className="gap-4" testID="karakter-secimi">
      <View className="gap-1">
        <Metin varyant="baslik" accessibilityRole="header">
          {mod === 'ilk'
            ? t('mobil.motivasyon.secim.baslik')
            : t('mobil.motivasyon.secim.turBaslik')}
        </Metin>
        <Metin varyant="ikincil">
          {mod === 'ilk'
            ? t('mobil.motivasyon.secim.aciklama')
            : t('mobil.motivasyon.secim.turUyari')}
        </Metin>
      </View>
      {turler.isPending ? <Yukleniyor /> : null}
      {turler.isError ? (
        <HataDurumu mesaj={hataMesaji(turler.error)} tekrar={() => void turler.refetch()} />
      ) : null}
      {turler.data ? (
        <View className="flex-row gap-2" accessibilityRole="radiogroup">
          {turler.data.map((x) => {
            const aktif = x.kod === secili;
            return (
              <Pressable
                key={x.kod}
                accessibilityRole="radio"
                accessibilityLabel={x.ad}
                accessibilityState={{ selected: aktif, disabled: x.kod === mevcutTur }}
                disabled={x.kod === mevcutTur}
                onPress={() => {
                  setSecili(x.kod);
                  setHata(null);
                }}
                testID={`tur-${x.kod}`}
                className={`min-h-dokunma flex-1 items-center gap-1 rounded-buyuk border p-2 active:opacity-80 ${
                  aktif ? 'border-2 border-birincil bg-yuzeyIkincil' : 'border-kenar bg-yuzey'
                } ${x.kod === mevcutTur ? 'opacity-50' : ''}`}
              >
                <Companion tur={turKodu(x.kod)} asama={1} seviye={1} ad={x.ad} boyut={80} statik />
                <Metin varyant="etiket">{x.ad}</Metin>
                <Metin varyant="kucuk">
                  {x.kod === mevcutTur
                    ? t('mobil.motivasyon.secim.mevcut')
                    : aktif
                      ? t('mobil.motivasyon.secim.secili')
                      : ' '}
                </Metin>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {secilen ? (
        <Kart className="gap-2" testID="asama-onizleme">
          <Metin varyant="etiket" accessibilityRole="header">
            {t('mobil.motivasyon.secim.asamalar', { ad: secilen.ad })}
          </Metin>
          <View className="flex-row justify-between">
            {secilen.asamalar.map((a) => (
              <View
                key={a.asama}
                className="items-center gap-1"
                style={{ width: '20%' }}
                accessible
                accessibilityLabel={t('mobil.motivasyon.secim.asamaEtiketi', {
                  asama: a.asama,
                  ad: a.ad,
                  seviye: a.gereken_seviye,
                })}
              >
                <Companion
                  tur={turKodu(secilen.kod)}
                  asama={a.asama}
                  seviye={a.gereken_seviye}
                  ad={secilen.ad}
                  boyut={52}
                  statik
                />
                <Metin varyant="kucuk" className="text-center" numberOfLines={1}>
                  {a.ad}
                </Metin>
                <Metin varyant="kucuk" className="text-center">
                  {t('mobil.motivasyon.secim.seviyeKisa', { n: a.gereken_seviye })}
                </Metin>
              </View>
            ))}
          </View>
        </Kart>
      ) : null}
      {mod === 'ilk' ? (
        <MetinGirdisi
          etiket={t('mobil.motivasyon.secim.adEtiketi')}
          value={ad}
          onChangeText={(v) => {
            setAd(v);
            setHata(null);
          }}
          maxLength={24}
          autoCorrect={false}
          returnKeyType="done"
          hata={hata}
          testID="karakter-ad"
        />
      ) : hata ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
          {hata}
        </Metin>
      ) : null}
      <Dugme
        buyuk
        etiket={
          mod === 'ilk'
            ? t('mobil.motivasyon.secim.basla')
            : t('mobil.motivasyon.secim.turDegistir')
        }
        disabled={!gonderilebilir}
        yukleniyor={bekliyor}
        onPress={() => void onayla()}
        testID="karakter-onayla"
      />
      {vazgec ? (
        <Dugme
          varyant="hayalet"
          etiket={t('mobil.motivasyon.secim.sonra')}
          onPress={vazgec}
          testID="karakter-sonra"
        />
      ) : null}
    </View>
  );
}
