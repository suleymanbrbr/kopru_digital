import {
  Canvas,
  Group,
  Image as SkiaImage,
  Path,
  useImage,
  type SkPath,
} from '@shopify/react-native-skia';
import { memo, useMemo, useReducer, useRef } from 'react';
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
  const gorsel = useImage(kaynak as never);
  const canli = useRef<{ cizgi: Cizgi; yol: SkPath } | null>(null);
  const [, yenile] = useReducer((n: number) => n + 1, 0);
  const duzenlenebilir = !!arac && !!onCizgi;

  function nokta(e: GestureResponderEvent): Nokta {
    const { locationX, locationY } = e.nativeEvent;
    return {
      x: Math.max(0, Math.min(1, locationX / genislik)),
      y: Math.max(0, Math.min(1, locationY / yukseklik)),
      t: zaman?.() ?? 0,
    };
  }

  function basla(e: GestureResponderEvent) {
    if (!arac) return;
    const p = nokta(e);
    const cizgi: Cizgi = {
      arac,
      kalinlik: arac === 'silgi' ? SILGI_KALINLIGI : KALEM_KALINLIGI,
      noktalar: [p],
    };
    const yol = yolOlustur([p], genislik, yukseklik);
    canli.current = { cizgi, yol };
    yenile();
  }

  function hareket(e: GestureResponderEvent) {
    const c = canli.current;
    if (!c) return;
    const p = nokta(e);
    const son = c.cizgi.noktalar[c.cizgi.noktalar.length - 1];
    if (son && Math.abs(son.x - p.x) < 0.0003 && Math.abs(son.y - p.y) < 0.0003) return;
    c.cizgi.noktalar.push(p);
    c.yol = yolOlustur(c.cizgi.noktalar, genislik, yukseklik);
    yenile();
  }

  function bitir() {
    const c = canli.current;
    canli.current = null;
    if (c) onCizgi?.({ ...c.cizgi, noktalar: [...c.cizgi.noktalar] });
    yenile();
  }

  const c = canli.current;
  return (
    <View style={{ width: genislik, height: yukseklik }} testID={testID}>
      <Canvas style={{ width: genislik, height: yukseklik }}>
        {gorsel ? (
          <SkiaImage image={gorsel} x={0} y={0} width={genislik} height={yukseklik} fit="fill" />
        ) : null}
        <Group layer={KATMAN_PAINT}>
          <CizgiKatmani cizgiler={cizgiler} g={genislik} y={yukseklik} />
          {c ? (
            <Path
              path={c.yol}
              style="stroke"
              strokeWidth={cizgiPx(c.cizgi, genislik)}
              strokeCap="round"
              strokeJoin="round"
              color={c.cizgi.arac === 'silgi' ? '#000000' : KALEM_HEX[c.cizgi.arac]}
              blendMode={c.cizgi.arac === 'silgi' ? 'clear' : 'srcOver'}
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
