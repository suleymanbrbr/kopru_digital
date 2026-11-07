import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { MOCK_OTP } from '../../api/mock';
import { e164, telefonBicimle } from '../../lib/telefon';
import { ortam } from '../../ortam';
import { Dugme } from '../../ui/Dugme';
import { Ekran } from '../../ui/Ekran';
import { Metin } from '../../ui/Metin';
import { MetinGirdisi } from '../../ui/MetinGirdisi';
import { hataMesaji } from '../../uygulama/hatalar';
import { useServisler } from '../../uygulama/baglam';

export default function Giris() {
  const router = useRouter();
  const { adaptorler } = useServisler();
  const [girdi, setGirdi] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);

  async function gonder() {
    const numara = e164(girdi);
    if (!numara) {
      setHata(t('mobil.giris.telefonGecersiz'));
      return;
    }
    setHata(null);
    setYukleniyor(true);
    try {
      const { yenidenGondermeSn } = await adaptorler.auth.otpIste(numara);
      router.push({ pathname: '/kod', params: { telefon: numara, sn: String(yenidenGondermeSn) } });
    } catch (e) {
      setHata(hataMesaji(e));
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Ekran klavye className="justify-center">
      <View className="gap-2">
        <Metin varyant="baslik" accessibilityRole="header">
          {t('giris.baslik')}
        </Metin>
        <Metin varyant="ikincil">{t('mobil.giris.altBaslik')}</Metin>
      </View>
      <MetinGirdisi
        etiket={t('giris.telefon')}
        onek={t('mobil.giris.ulkeKodu')}
        placeholder={t('mobil.giris.telefonIpucu')}
        value={girdi}
        onChangeText={(v) => {
          setGirdi(telefonBicimle(v));
          setHata(null);
        }}
        hata={hata}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        returnKeyType="send"
        onSubmitEditing={() => void gonder()}
        autoFocus
      />
      <Dugme etiket={t('giris.kodGonder')} buyuk yukleniyor={yukleniyor} onPress={() => void gonder()} />
      {ortam.apiMock ? (
        <Metin varyant="kucuk" className="text-center">
          {t('mobil.giris.mockIpucu').replace('123456', MOCK_OTP)}
        </Metin>
      ) : null}
    </Ekran>
  );
}
