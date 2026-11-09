import { t } from '@kopru/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Ikon } from '../ui/Ikon';
import { Metin } from '../ui/Metin';
import { useServisler } from '../uygulama/baglam';

/**
 * Cevrimdisiyken ya da bekleyen degisiklik varken ekran ustunde bilgi seridi. Kalici hatayla
 * gonderilemeyen isler varsa ayri, dokunulabilir bir uyari gosterilir (Gonderilemeyen yoklamalar).
 */
export function CevrimdisiSerit() {
  const router = useRouter();
  const { kuyruk, agGozlemcisi } = useServisler();
  const [cevrimici, setCevrimici] = useState(agGozlemcisi.cevrimiciMi());
  const [bekleyen, setBekleyen] = useState(kuyruk.bekleyenler().length);
  const [basarisiz, setBasarisiz] = useState(kuyruk.basarisizlar().length);

  useEffect(() => {
    const a = agGozlemcisi.abone(setCevrimici);
    const b = kuyruk.abone(() => {
      setBekleyen(kuyruk.bekleyenler().length);
      setBasarisiz(kuyruk.basarisizlar().length);
    });
    return () => {
      a();
      b();
    };
  }, [kuyruk, agGozlemcisi]);

  const mesaj = cevrimici
    ? t('mobil.durum.bekleyenGonderiliyor')
    : bekleyen > 0
      ? `${t('mobil.durum.cevrimdisi')}. ${t('mobil.profil.bekleyenIstek', { n: bekleyen })}`
      : t('mobil.durum.cevrimdisi');
  const bilgiGoster = !cevrimici || bekleyen > 0;

  return (
    <>
      {bilgiGoster ? (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="flex-row items-center gap-2 bg-yuzeyIkincil px-4 py-2"
        >
          <Ikon ad={cevrimici ? 'sync' : 'cloud-offline-outline'} boyut={16} />
          <Metin varyant="ikincil" className="flex-1">
            {mesaj}
          </Metin>
        </View>
      ) : null}
      {basarisiz > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('mobil.senkron.serit', { n: basarisiz })}
          onPress={() => {
            router.push('/senkron');
          }}
          className="min-h-dokunma flex-row items-center gap-2 border-y border-hata bg-yuzeyIkincil px-4 py-2"
          testID="senkron-serit"
        >
          <Ikon ad="alert-circle" boyut={18} />
          <Metin varyant="etiket" className="flex-1 text-hata">
            {t('mobil.senkron.serit', { n: basarisiz })}
          </Metin>
          <Ikon ad="chevron-forward" boyut={16} />
        </Pressable>
      ) : null}
    </>
  );
}
