import { DarkTheme, DefaultTheme, ThemeProvider, type Theme } from 'expo-router';
import { vars } from 'nativewind';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { etkinRenkler, renkDegiskenleri, type Sema } from './degiskenler';
import { GERCEK_TEMA_PORTU, semaCoz, temaDenetleyicisiOlustur } from './sema';
import { tercihler } from './tercihler';

type Renkler = ReturnType<typeof etkinRenkler>;
interface TemaBaglami {
  sema: Sema;
  renkler: Renkler;
}

const Baglam = createContext<TemaBaglami | null>(null);

export function useTema(): TemaBaglami {
  const b = useContext(Baglam);
  if (!b) throw new Error('useTema, TemaSaglayici disinda kullanildi.');
  return b;
}

interface Props {
  /** Kurum vurgu rengi (#RRGGBB); calisma aninda ezer. */
  vurgu?: string | null;
  children: ReactNode;
}

/**
 * Acik/koyu temayi ve kurum vurgusunu NativeWind CSS degiskenleri olarak kok gorunume uygular.
 * Etkin sema `sema.ts` denetleyicisinden gelir (NativeWind `setColorScheme` kullanilmaz).
 */
export function TemaSaglayici({ vurgu, children }: Props) {
  const [denetleyici] = useState(() => temaDenetleyicisiOlustur(GERCEK_TEMA_PORTU, tercihler));
  const tercih = tercihler.kullan((t) => t.tema);
  const sistem = denetleyici.durum.kullan((d) => d.sistem);

  useEffect(() => denetleyici.baglan(), [denetleyici]);

  const sema: Sema = semaCoz(tercih, sistem);
  const baglam = useMemo<TemaBaglami>(
    () => ({ sema, renkler: etkinRenkler(sema, vurgu) }),
    [sema, vurgu],
  );
  const degiskenler = useMemo(() => vars(renkDegiskenleri(sema, vurgu)), [sema, vurgu]);

  const navTema = useMemo<Theme>(() => {
    const taban = sema === 'koyu' ? DarkTheme : DefaultTheme;
    return {
      ...taban,
      colors: {
        ...taban.colors,
        primary: baglam.renkler.birincil,
        background: baglam.renkler.arkaPlan,
        card: baglam.renkler.yuzey,
        text: baglam.renkler.metin,
        border: baglam.renkler.kenar,
        notification: baglam.renkler.vurgu,
      },
    };
  }, [sema, baglam]);

  return (
    <Baglam.Provider value={baglam}>
      <ThemeProvider value={navTema}>
        <View style={[{ flex: 1 }, degiskenler]} className="bg-arkaPlan">
          {children}
        </View>
      </ThemeProvider>
    </Baglam.Provider>
  );
}
