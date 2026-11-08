import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

interface Props {
  children: ReactNode;
  /** Varsayilan: kaydirilabilir. */
  kaydir?: boolean;
  /** Klavye acilinca icerigi yukari iter (form ekranlari). */
  klavye?: boolean;
  /** Sekme cubugu zaten alt bosluk verir; o zaman 'bottom' dislanir. */
  kenarlar?: readonly Edge[];
  className?: string;
}

/** Guvenli alan + opsiyonel kaydirma/klavye isleme ile ekran iskeleti. */
export function Ekran({
  children,
  kaydir = true,
  klavye = false,
  kenarlar = ['top', 'bottom', 'left', 'right'],
  className = '',
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
