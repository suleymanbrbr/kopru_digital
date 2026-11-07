import { t } from '@kopru/i18n';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Dugme } from '../../ui/Dugme';
import { Ekran } from '../../ui/Ekran';
import { Ikon } from '../../ui/Ikon';
import { Kart } from '../../ui/Kart';
import { Metin } from '../../ui/Metin';
import { useOturum, useServisler } from '../../uygulama/baglam';
import { hataMesaji } from '../../uygulama/hatalar';

/** KVKK onayi: kabul edilmeden uygulamanin geri kalanina gecilemez (Stack.Protected). */
export default function Kvkk() {
  const { oturum } = useServisler();
  const durum = useOturum();
  const [onay, setOnay] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const surum = durum.asama === 'giris' ? durum.kvkk.guncelSurum : '';

  async function kabul() {
    setYukleniyor(true);
    setHata(null);
    try {
      await oturum.kvkkKabulEt();
    } catch (e) {
      setHata(hataMesaji(e));
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Ekran>
      <View className="gap-2">
        <Metin varyant="baslik" accessibilityRole="header">
          {t('kvkk.baslik')}
        </Metin>
        <Metin varyant="ikincil">{t('kvkk.aciklama')}</Metin>
      </View>
      <Kart className="gap-2">
        <Metin>{t('mobil.kvkk.ozet')}</Metin>
        <Metin varyant="kucuk">{t('mobil.kvkk.surum', { surum })}</Metin>
      </Kart>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: onay }}
        accessibilityLabel={t('mobil.kvkk.onayKutusuEtiketi')}
        onPress={() => {
          setOnay((o) => !o);
        }}
        className="min-h-dokunma flex-row items-center gap-3"
      >
        <View
          className={`h-7 w-7 items-center justify-center rounded-kucuk border-2 ${
            onay ? 'border-birincil bg-birincil' : 'border-kenar bg-yuzey'
          }`}
        >
          {onay ? <Ikon ad="checkmark" boyut={18} renk="#FFFFFF" /> : null}
        </View>
        <Metin className="flex-1">{t('kvkk.onay')}</Metin>
      </Pressable>
      {hata ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
          {hata}
        </Metin>
      ) : null}
      <Dugme
        etiket={t('mobil.kvkk.kabulEt')}
        buyuk
        disabled={!onay}
        yukleniyor={yukleniyor}
        onPress={() => void kabul()}
      />
      <Dugme varyant="hayalet" etiket={t('mobil.kvkk.cikis')} onPress={() => void oturum.cikis()} />
    </Ekran>
  );
}
