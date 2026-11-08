import type { ReactNode } from 'react';
import { Linking, Text, View } from 'react-native';

import { Metin } from '../../ui/Metin';
import { markdownAyristir, type Blok, type Satir } from './ayristir';

function baglantiAc(href: string) {
  // Ayristirici yalniz http/https baglantisi uretir; yine de cihaz hatasi ekrani dusurmesin.
  Linking.openURL(href).catch(() => undefined);
}

export function SatirlariCiz({ satirlar }: { satirlar: Satir[] }): ReactNode {
  return satirlar.map((s, i) => {
    switch (s.tur) {
      case 'metin':
        return s.metin;
      case 'kalin':
        return (
          <Text key={i} className="font-kalin">
            <SatirlariCiz satirlar={s.ic} />
          </Text>
        );
      case 'italik':
        return (
          <Text key={i} style={{ fontStyle: 'italic' }}>
            <SatirlariCiz satirlar={s.ic} />
          </Text>
        );
      case 'baglanti':
        return (
          <Text
            key={i}
            accessibilityRole="link"
            className="text-birincil underline"
            onPress={() => {
              baglantiAc(s.href);
            }}
          >
            <SatirlariCiz satirlar={s.ic} />
          </Text>
        );
    }
  });
}

export function BloklariCiz({ bloklar }: { bloklar: Blok[] }): ReactNode {
  return bloklar.map((b, i) => {
    switch (b.tur) {
      case 'paragraf':
        return (
          <Metin key={i} className="text-metinIkincil">
            <SatirlariCiz satirlar={b.ic} />
          </Metin>
        );
      case 'baslik':
        return (
          <Metin
            key={i}
            varyant={b.seviye <= 2 ? 'altBaslik' : 'etiket'}
            accessibilityRole="header"
            className="mt-1"
          >
            <SatirlariCiz satirlar={b.ic} />
          </Metin>
        );
      case 'alinti':
        return (
          <View key={i} className="gap-2 border-l-4 border-kenar pl-3">
            <BloklariCiz bloklar={b.bloklar} />
          </View>
        );
      case 'liste':
        return (
          <View key={i} className="gap-1">
            {b.ogeler.map((oge, j) => (
              <View key={j} className="flex-row gap-2">
                <Metin className="text-metinIkincil">
                  {b.sirali ? `${String(b.baslangic + j)}.` : '•'}
                </Metin>
                <View className="flex-1 gap-1">
                  <BloklariCiz bloklar={oge} />
                </View>
              </View>
            ))}
          </View>
        );
      case 'duz':
        return (
          <Metin key={i} className="text-metinIkincil">
            {b.metin}
          </Metin>
        );
    }
  });
}

/**
 * Markdown'i HTML'e/WebView'a cevirmeden RN bilesenleri olarak cizer. Bilinmeyen ogeler duz metin,
 * http/https disindaki baglantilar tiklanamaz metindir (bkz. `ayristir.ts`).
 */
export function Markdown({ kaynak }: { kaynak: string }) {
  return (
    <View className="gap-3">
      <BloklariCiz bloklar={markdownAyristir(kaynak)} />
    </View>
  );
}
