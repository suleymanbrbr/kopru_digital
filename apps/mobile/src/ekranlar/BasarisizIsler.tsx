import { t } from '@kopru/i18n';
import { Alert, View } from 'react-native';

import { kisaZaman } from '../lib/saat';
import type { KuyrukIsi } from '../offline/kuyruk';
import { YOKLAMA_TURU, type YoklamaYuku } from '../offline/yoklama';
import { Dugme } from '../ui/Dugme';
import { BosDurum } from '../ui/Durumlar';
import { Ekran } from '../ui/Ekran';
import { Ikon } from '../ui/Ikon';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { useServisler } from '../uygulama/baglam';
import { kuyrukHataMesaji } from '../uygulama/hatalar';
import { useKuyruk, useSaatDilimi } from '../uygulama/operasyon';

function IsKarti({ is, tz }: { is: KuyrukIsi; tz: string }) {
  const { kuyruk } = useServisler();
  const yuk = is.yuk as Partial<YoklamaYuku>;
  const ders = yuk.dersBaslik ?? t('mobil.ders.adsiz');
  const saat = yuk.dersBaslangic ? kisaZaman(yuk.dersBaslangic, tz) : '';
  const neden = kuyrukHataMesaji(is.sonHataKodu);

  function vazgec() {
    Alert.alert(t('mobil.senkron.vazgecOnay'), t('mobil.senkron.vazgecOnayMesaj'), [
      { text: t('ortak.iptal'), style: 'cancel' },
      {
        text: t('mobil.senkron.vazgec'),
        style: 'destructive',
        onPress: () => {
          kuyruk.sil(is.istekId);
        },
      },
    ]);
  }

  return (
    <Kart className="gap-3 border-hata" testID={`basarisiz-${is.istekId}`}>
      <View
        className="gap-1"
        accessible
        accessibilityLabel={`${t('mobil.senkron.dersEtiketi', { ders, saat })}. ${t('mobil.senkron.neden', { neden })}`}
      >
        <View className="flex-row items-center gap-2">
          <Ikon ad="alert-circle" boyut={18} />
          <Metin varyant="altBaslik" className="flex-1">
            {t('mobil.senkron.dersEtiketi', { ders, saat })}
          </Metin>
        </View>
        {is.tur === YOKLAMA_TURU && yuk.satirlar ? (
          <Metin varyant="kucuk">
            {t('mobil.senkron.satirSayisi', { n: yuk.satirlar.length })}
          </Metin>
        ) : null}
        <Metin varyant="ikincil" className="text-hata">
          {t('mobil.senkron.neden', { neden })}
        </Metin>
      </View>
      <View className="flex-row gap-2">
        <Dugme
          className="flex-1"
          etiket={t('mobil.senkron.tekrarDene')}
          onPress={() => {
            kuyruk.yenidenDene(is.istekId);
            void kuyruk.bosalt();
          }}
        />
        <Dugme
          className="flex-1"
          varyant="ikincil"
          etiket={t('mobil.senkron.vazgec')}
          onPress={vazgec}
        />
      </View>
    </Kart>
  );
}

/** Kalici (4xx) hatayla gonderilemeyen isler: neden, tekrar dene, vazgec. Hicbiri sessizce kaybolmaz. */
export function BasarisizIsler() {
  const { basarisiz, bekleyen } = useKuyruk();
  const { tz } = useSaatDilimi();
  return (
    <Ekran kenarlar={['left', 'right', 'bottom']}>
      {bekleyen.length > 0 ? (
        <Kart>
          <Metin varyant="ikincil" accessibilityLiveRegion="polite">
            {t('mobil.senkron.bekleyen', { n: bekleyen.length })}
          </Metin>
        </Kart>
      ) : null}
      {basarisiz.length === 0 ? (
        <BosDurum ikon="checkmark-circle-outline" mesaj={t('mobil.senkron.bos')} />
      ) : (
        basarisiz.map((is) => <IsKarti key={is.istekId} is={is} tz={tz} />)
      )}
    </Ekran>
  );
}
