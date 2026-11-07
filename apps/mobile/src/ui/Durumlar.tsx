import { t } from '@kopru/i18n';
import { ActivityIndicator, View } from 'react-native';

import { useTema } from '../tema/TemaSaglayici';

import { Dugme } from './Dugme';
import { Ikon } from './Ikon';
import { Metin } from './Metin';

export function Yukleniyor({ etiket = t('ortak.yukleniyor') }: { etiket?: string }) {
  const { renkler } = useTema();
  return (
    <View className="items-center justify-center gap-3 p-8" accessibilityLiveRegion="polite">
      <ActivityIndicator color={renkler.birincil} accessibilityLabel={etiket} />
      <Metin varyant="ikincil">{etiket}</Metin>
    </View>
  );
}

interface BosProps {
  mesaj: string;
  baslik?: string;
  ikon?: 'sparkles' | 'calendar-outline' | 'chatbubbles-outline' | 'checkmark-circle-outline';
}

/** Bos durum: yargilayici olmayan, yol gosteren kisa metin. */
export function BosDurum({ mesaj, baslik, ikon = 'sparkles' }: BosProps) {
  const { renkler } = useTema();
  return (
    <View className="items-center gap-2 px-4 py-6" accessible accessibilityLabel={`${baslik ?? ''} ${mesaj}`.trim()}>
      <Ikon ad={ikon} boyut={28} renk={renkler.metinIkincil} />
      {baslik ? <Metin varyant="etiket">{baslik}</Metin> : null}
      <Metin varyant="ikincil" className="text-center">
        {mesaj}
      </Metin>
    </View>
  );
}

export function HataDurumu({ mesaj, tekrar }: { mesaj: string; tekrar?: () => void }) {
  const { renkler } = useTema();
  return (
    <View className="items-center gap-3 px-4 py-6" accessibilityRole="alert">
      <Ikon ad="alert-circle-outline" boyut={28} renk={renkler.hata} />
      <Metin varyant="etiket">{t('mobil.durum.hataBaslik')}</Metin>
      <Metin varyant="ikincil" className="text-center">
        {mesaj}
      </Metin>
      {tekrar ? <Dugme etiket={t('ortak.tekrarDene')} varyant="ikincil" onPress={tekrar} /> : null}
    </View>
  );
}
