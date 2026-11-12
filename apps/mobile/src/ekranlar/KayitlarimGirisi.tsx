import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Ikon } from '../ui/Ikon';
import { Metin } from '../ui/Metin';
import { useKayitlarim, useKayitlarimAcik } from '../uygulama/kayit';

/**
 * Ogrenci "Bugun" giris noktasi: izlenmemis kayit sayisini gosterir ve `Kayitlarim` ekranini acar
 * (uygulama acilisindan kayda: Bugun -> Kayitlarim -> kayit = en fazla 2 dokunus). `kayitlar`
 * modulu kapaliysa ya da rol ogrenci degilse hicbir sey cizilmez.
 */
export function KayitlarimGirisi() {
  const router = useRouter();
  const acik = useKayitlarimAcik();
  const sorgu = useKayitlarim({});
  if (!acik) return null;
  const ilk = sorgu.data?.pages[0];
  const yeni = ilk?.kayitlar.filter((k) => !k.izlendi).length ?? 0;
  // Ilk sayfa doluysa gercek sayi daha fazla olabilir: "30+".
  const sayi = ilk?.sonrakiImlec ? `${String(yeni)}+` : String(yeni);
  const ozet = yeni > 0 ? t('mobil.kayit.girisYeni', { n: sayi }) : t('mobil.kayit.girisOzet');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('mobil.kayit.baslik')}. ${ozet}`}
      testID="kayitlarim-giris"
      onPress={() => {
        router.push('/kayitlarim');
      }}
      className="min-h-dokunma flex-row items-center gap-3 rounded-buyuk border border-kenar bg-yuzey p-4 active:opacity-80"
    >
      <Ikon ad="play-circle-outline" boyut={28} />
      <View className="flex-1 gap-1">
        <Metin varyant="altBaslik">{t('mobil.kayit.baslik')}</Metin>
        <Metin varyant="ikincil">{ozet}</Metin>
      </View>
      <Ikon ad="chevron-forward" />
    </Pressable>
  );
}
