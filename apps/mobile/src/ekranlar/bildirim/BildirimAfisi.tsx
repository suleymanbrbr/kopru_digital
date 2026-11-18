import { t } from '@kopru/i18n';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ikon } from '../../ui/Ikon';
import { Metin } from '../../ui/Metin';
import { useServisler } from '../../uygulama/baglam';

/** Afis ekranda bu kadar kalir (ms). */
export const AFIS_SURESI_MS = 5000;

/**
 * Uygulama ONDEYKEN gelen bildirim icin kucuk uygulama ici afis (sistem afisi cikmaz). Dokununca
 * bildirimin hedefi acilir ve okundu olur; kapat dugmesi ya da zaman asimi afisi kaldirir.
 * Yalnizca oturum acikken cizilir.
 */
export function BildirimAfisi() {
  const { bildirim } = useServisler();
  const ins = useSafeAreaInsets();
  const afis = bildirim.durum.kullan((d) => d.afis);
  const anahtar = afis?.anahtar;

  useEffect(() => {
    if (anahtar === undefined) return;
    const z = setTimeout(() => {
      bildirim.afisKapat(anahtar);
    }, AFIS_SURESI_MS);
    return () => {
      clearTimeout(z);
    };
  }, [anahtar, bildirim]);

  if (!afis) return null;
  const baslik = afis.yuk.baslik || t('mobil.bildirim.baslik');
  return (
    <View
      pointerEvents="box-none"
      className="absolute left-0 right-0 top-0 px-3"
      style={{ paddingTop: ins.top + 8, zIndex: 100 }}
    >
      <View
        accessibilityLiveRegion="polite"
        testID="bildirim-afisi"
        className="flex-row items-center gap-3 rounded-buyuk border border-kenar bg-yuzey p-3"
        style={{
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 6,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('mobil.bildirim.afis.ac', { baslik })}
          onPress={() => {
            bildirim.afisKapat();
            bildirim.ogeyeDokunuldu(afis.yuk);
          }}
          className="min-h-dokunma flex-1 flex-row items-center gap-3 active:opacity-80"
        >
          <Ikon ad="notifications" boyut={22} />
          <View className="flex-1">
            <Metin varyant="etiket" numberOfLines={1}>
              {baslik}
            </Metin>
            {afis.yuk.govde ? (
              <Metin varyant="ikincil" numberOfLines={2}>
                {afis.yuk.govde}
              </Metin>
            ) : null}
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('mobil.bildirim.afis.kapat')}
          onPress={() => {
            bildirim.afisKapat();
          }}
          hitSlop={8}
          className="min-h-dokunma min-w-dokunma items-center justify-center"
        >
          <Ikon ad="close" boyut={20} />
        </Pressable>
      </View>
    </View>
  );
}
