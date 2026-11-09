import type { ReactNode, ComponentRef, Ref } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

/** `Ekran` kaydirma kapsayicisinin ornek tipi. */
export type KaydirmaOgesi = ComponentRef<typeof ScrollView>;

interface Props {
  children: ReactNode;
  /** Varsayilan: kaydirilabilir. */
  kaydir?: boolean;
  /** Klavye acilinca icerigi yukari iter (form ekranlari). */
  klavye?: boolean;
  /** Sekme cubugu zaten alt bosluk verir; o zaman 'bottom' dislanir. */
  kenarlar?: readonly Edge[];
  className?: string;
  /**
   * Guvenli alanin (durum cubugu/Dynamic Island) ALTINDA, icerigin ustunde sabit duran yuva
   * (ornegin cevrimdisi seridi). Icerik ayrica ust bosluk almaz.
   */
  ust?: ReactNode;
  /** Kaydirma kapsayicisi referansi (belirli bir ogeye kaydirmak icin). */
  kaydirmaRef?: Ref<KaydirmaOgesi>;
}

/** Guvenli alan + opsiyonel kaydirma/klavye isleme ile ekran iskeleti. */
export function Ekran({
  children,
  kaydir = true,
  klavye = false,
  kenarlar = ['top', 'bottom', 'left', 'right'],
  className = '',
  ust,
  kaydirmaRef,
}: Props) {
  const ins = useSafeAreaInsets();
  const stil = {
    paddingTop: kenarlar.includes('top') ? ins.top : 0,
    paddingBottom: kenarlar.includes('bottom') ? ins.bottom : 0,
    paddingLeft: kenarlar.includes('left') ? ins.left : 0,
    paddingRight: kenarlar.includes('right') ? ins.right : 0,
  };
  const icerik = kaydir ? (
    <ScrollView
      ref={kaydirmaRef}
      contentContainerClassName={`grow gap-4 p-4 ${className}`}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      {children}
    </ScrollView>
  ) : (
    <View className={`flex-1 gap-4 p-4 ${className}`}>{children}</View>
  );
  return (
    <View className="flex-1 bg-arkaPlan" style={stil}>
      {ust}
      {klavye ? (
        // Android'de kenardan kenara duzende pencere klavyeyle kuculmez; iki platformda da bosluk birakilir.
        <KeyboardAvoidingView className="flex-1" behavior="padding">
          {icerik}
        </KeyboardAvoidingView>
      ) : (
        icerik
      )}
    </View>
  );
}
