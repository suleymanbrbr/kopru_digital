import { t } from '@kopru/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { rakamlar } from '../../lib/telefon';
import { Dugme } from '../../ui/Dugme';
import { Ekran } from '../../ui/Ekran';
import { Metin } from '../../ui/Metin';
import { useServisler } from '../../uygulama/baglam';
import { hataMesaji } from '../../uygulama/hatalar';

const HANE = 6;

export default function Kod() {
  const router = useRouter();
  const { adaptorler, oturum } = useServisler();
  const { telefon = '', sn = '30' } = useLocalSearchParams<{ telefon: string; sn: string }>();
  const [kod, setKod] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [kalan, setKalan] = useState(Number(sn) || 30);
  const girdi = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (kalan <= 0) return;
    const z = setTimeout(() => {
      setKalan((k) => k - 1);
    }, 1000);
    return () => {
      clearTimeout(z);
    };
  }, [kalan]);

  async function dogrula(deger: string) {
    if (deger.length !== HANE || yukleniyor) return;
    setYukleniyor(true);
    setHata(null);
    try {
      await adaptorler.auth.otpDogrula(telefon, deger);
      await oturum.girisTamamlandi();
    } catch (e) {
      setHata(hataMesaji(e));
      setKod('');
      girdi.current?.focus();
    } finally {
      setYukleniyor(false);
    }
  }

  async function yenidenGonder() {
    try {
      const r = await adaptorler.auth.otpIste(telefon);
      setKalan(r.yenidenGondermeSn);
      setHata(null);
    } catch (e) {
      setHata(hataMesaji(e));
    }
  }

  return (
    <Ekran klavye className="justify-center">
      <View className="gap-2">
        <Metin varyant="baslik" accessibilityRole="header">
          {t('giris.kodGir')}
        </Metin>
        <Metin varyant="ikincil">{t('mobil.giris.kodAciklama', { telefon })}</Metin>
      </View>

      <Pressable
        onPress={() => girdi.current?.focus()}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        className="flex-row justify-between gap-2"
      >
        {Array.from({ length: HANE }, (_, i) => {
          const dolu = kod[i];
          const aktif = i === Math.min(kod.length, HANE - 1);
          return (
            <View
              key={i}
              className={`h-14 flex-1 items-center justify-center rounded-orta border-2 bg-yuzey ${
                hata ? 'border-hata' : aktif ? 'border-birincil' : 'border-kenar'
              }`}
            >
              <Metin varyant="baslik">{dolu ?? ''}</Metin>
            </View>
          );
        })}
      </Pressable>
      {/* Gercek girdi: gorunmez ama erisilebilir; SMS otomatik doldurma ve yapistirma icin. */}
      <TextInput
        ref={girdi}
        value={kod}
        onChangeText={(v) => {
          const r = rakamlar(v).slice(0, HANE);
          setKod(r);
          setHata(null);
          if (r.length === HANE) void dogrula(r);
        }}
        accessibilityLabel={t('mobil.giris.kodGirisiEtiketi')}
        accessibilityHint={hata ?? undefined}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={HANE}
        autoFocus
        caretHidden
        style={{ position: 'absolute', opacity: 0.02, height: 56, width: '100%', top: 0 }}
      />
      {hata ? (
        <Metin varyant="ikincil" className="text-hata" accessibilityLiveRegion="polite">
          {hata}
        </Metin>
      ) : null}

      <Dugme
        etiket={t('mobil.giris.dogrula')}
        buyuk
        yukleniyor={yukleniyor}
        disabled={kod.length !== HANE}
        onPress={() => void dogrula(kod)}
      />
      <Dugme
        varyant="hayalet"
        etiket={kalan > 0 ? t('mobil.giris.yenidenGonderSn', { sn: kalan }) : t('mobil.giris.yenidenGonder')}
        disabled={kalan > 0}
        onPress={() => void yenidenGonder()}
      />
      <Dugme varyant="hayalet" etiket={t('mobil.giris.numaraDegistir')} onPress={() => router.back()} />
    </Ekran>
  );
}
