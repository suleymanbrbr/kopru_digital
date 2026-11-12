import {
  Canvas,
  Group,
  Image as SkiaImage,
  Path,
  useImage,
  type SkPath,
} from '@shopify/react-native-skia';
import { memo, useMemo, useRef, useState } from 'react';
import { View, type GestureResponderEvent } from 'react-native';

import {
  KALEM_HEX,
  KALEM_KALINLIGI,
  SILGI_KALINLIGI,
  type Arac,
  type Cizgi,
  type Nokta,
} from './model';
import { cizgiPx, yolOlustur } from './yol';

export type GorselKaynagi = string | number;

interface Props {
  kaynak: GorselKaynagi;
  /** Fotograf yuksekligi / genisligi. */
  oran: number;
  /** Tuval genisligi (px); yukseklik `genislik * oran`. */
  genislik: number;
  cizgiler: readonly Cizgi[];
  /** Verilmezse salt okunur (oynatici). */
  arac?: Arac;
  onCizgi?: (c: Cizgi) => void;
  /** Yeni noktalarin zaman damgasi (ms): mini anlatimda ses kaydi suresi. */
  zaman?: () => number;
  testID?: string;
}

const KATMAN_PAINT = true;

const CizgiKatmani = memo(function CizgiKatmani({
  cizgiler,
  g,
  y,
}: {
  cizgiler: readonly Cizgi[];
  g: number;
  y: number;
}) {
  const yollar = useMemo(
    () => cizgiler.map((c) => ({ c, yol: yolOlustur(c.noktalar, g, y) })),
    [cizgiler, g, y],
  );
  return (
    <>
      {yollar.map(({ c, yol }, i) => (
        <Path
          key={i}
          path={yol}
          style="stroke"
          strokeWidth={cizgiPx(c, g)}
          strokeCap="round"
          strokeJoin="round"
          color={c.arac === 'silgi' ? '#000000' : KALEM_HEX[c.arac]}
          blendMode={c.arac === 'silgi' ? 'clear' : 'srcOver'}
        />
      ))}
    </>
  );
});

/**
 * Fotograf + vektor cizim tuvali (Skia). Dokunmatik olaylar JS'ten gelir ama canli cizgi yalniz tek
 * bir mutable `SkPath`e nokta ekler ve kucuk bir sayacla yeniden boyar: kayitli cizgiler
 * (`CizgiKatmani`) bellekte kalir, kalem gecikmesi hissedilmez. Silgi, cizim KATMANINDA `clear`
 * karisimidir (fotograf silinmez).
 */
export function Tuval({ kaynak, oran, genislik, cizgiler, arac, onCizgi, zaman, testID }: Props) {
  const yukseklik = Math.round(genislik * oran);
  const gorsel = useImage(kaynak);
  /** Canli (henuz bitmemis) cizgi: noktalar mutable dizide, goruntu yeni yolla state'e yazilir. */
  const noktalar = useRef<Nokta[]>([]);
  const [canli, setCanli] = useState<{ arac: Arac; kalinlik: number; yol: SkPath } | null>(null);
  const duzenlenebilir = !!arac && !!onCizgi;

  function nokta(e: GestureResponderEvent): Nokta {
    const { locationX, locationY } = e.nativeEvent;
    return {
      x: Math.max(0, Math.min(1, locationX / genislik)),
      y: Math.max(0, Math.min(1, locationY / yukseklik)),
      t: zaman?.() ?? 0,
    };
  }

  function guncelle() {
    if (!arac) return;
    setCanli({
      arac,
      kalinlik: arac === 'silgi' ? SILGI_KALINLIGI : KALEM_KALINLIGI,
      yol: yolOlustur(noktalar.current, genislik, yukseklik),
    });
  }

  function basla(e: GestureResponderEvent) {
    noktalar.current = [nokta(e)];
    guncelle();
  }

  function hareket(e: GestureResponderEvent) {
    if (noktalar.current.length === 0) return;
    const p = nokta(e);
    const son = noktalar.current.at(-1);
    if (son && Math.abs(son.x - p.x) < 0.0003 && Math.abs(son.y - p.y) < 0.0003) return;
    noktalar.current.push(p);
    guncelle();
  }

  function bitir() {
    const n = noktalar.current;
    noktalar.current = [];
    setCanli(null);
    if (arac && n.length > 0) {
      onCizgi?.({
        arac,
        kalinlik: arac === 'silgi' ? SILGI_KALINLIGI : KALEM_KALINLIGI,
        noktalar: [...n],
      });
    }
  }

  return (
    <View style={{ width: genislik, height: yukseklik }} testID={testID}>
      <Canvas style={{ width: genislik, height: yukseklik }}>
        {gorsel ? (
          <SkiaImage image={gorsel} x={0} y={0} width={genislik} height={yukseklik} fit="fill" />
        ) : null}
        <Group layer={KATMAN_PAINT}>
          <CizgiKatmani cizgiler={cizgiler} g={genislik} y={yukseklik} />
          {canli ? (
            <Path
              path={canli.yol}
              style="stroke"
              strokeWidth={(canli.kalinlik / 10_000) * genislik}
              strokeCap="round"
              strokeJoin="round"
              color={canli.arac === 'silgi' ? '#000000' : KALEM_HEX[canli.arac]}
              blendMode={canli.arac === 'silgi' ? 'clear' : 'srcOver'}
            />
          ) : null}
        </Group>
      </Canvas>
      {duzenlenebilir ? (
        <View
          style={{ position: 'absolute', left: 0, top: 0, width: genislik, height: yukseklik }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={basla}
          onResponderMove={hareket}
          onResponderRelease={bitir}
          onResponderTerminate={bitir}
          accessibilityLabel="Çizim alanı"
          accessibilityRole="image"
        />
      ) : null}
    </View>
  );
}
