import { View } from 'react-native';
import Svg, { Circle, Line, Polygon } from 'react-native-svg';

import {
  noktalarMetni,
  radarCokgeni,
  radarHalkasi,
  radarMetni,
  radarNoktasi,
  radarOlcegi,
  type RadarBeceri,
} from '../../motivasyon/radar';
import { useTema } from '../../tema/TemaSaglayici';
import { Metin } from '../../ui/Metin';

interface Props {
  beceriler: readonly RadarBeceri[];
  /** Grafik kenari (dp); etiketler icin kenarlarda pay birakilir. */
  boyut?: number;
}

const ETIKET_PAYI = 62;

/**
 * Beceri grafigi (besgen). Etiketler ve puanlar RN metni olarak cizilir (yazi boyutuna uyar, renk
 * tek sinyal degildir); grafigin tamami tek erisilebilir ogedir ve sesli metin alternatifi verir
 * ("Beceriler: Sayısal 12, Sözel 3, ...").
 */
export function BeceriRadari({ beceriler, boyut = 220 }: Props) {
  const { renkler } = useTema();
  const n = beceriler.length;
  const merkez = boyut / 2;
  const yaricap = boyut / 2 - 6;
  const olcek = radarOlcegi(beceriler);
  const cokgen = radarCokgeni(beceriler, merkez, yaricap, olcek);
  const kapsam = boyut + ETIKET_PAYI * 2;
  if (n < 3) return null;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={radarMetni(beceriler)}
      testID="beceri-radari"
      style={{ width: kapsam, height: boyut + 44 + 40, alignSelf: 'center' }}
    >
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ position: 'absolute', left: ETIKET_PAYI, top: 44, width: boyut, height: boyut }}
      >
        <Svg width={boyut} height={boyut}>
          {[0.25, 0.5, 0.75, 1].map((oran) => (
            <Polygon
              key={oran}
              points={noktalarMetni(radarHalkasi(n, oran, merkez, yaricap))}
              fill="none"
              stroke={renkler.kenar}
              strokeWidth={1}
            />
          ))}
          {beceriler.map((b, i) => {
            const u = radarNoktasi(i, n, 1, merkez, yaricap);
            return (
              <Line
                key={b.kod}
                x1={merkez}
                y1={merkez}
                x2={u.x}
                y2={u.y}
                stroke={renkler.kenar}
                strokeWidth={1}
              />
            );
          })}
          <Polygon
            points={noktalarMetni(cokgen)}
            fill={renkler.vurgu}
            fillOpacity={0.35}
            stroke={renkler.birincil}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          {cokgen.map((p, i) => (
            <Circle key={beceriler[i]?.kod ?? i} cx={p.x} cy={p.y} r={4} fill={renkler.birincil} />
          ))}
        </Svg>
      </View>
      {beceriler.map((b, i) => {
        const u = radarNoktasi(i, n, 1.42, merkez, yaricap);
        const solda = u.x < merkez - 4;
        const sagda = u.x > merkez + 4;
        const genislik = 84;
        const sol = ETIKET_PAYI + u.x - (solda ? genislik - 12 : sagda ? 12 : genislik / 2);
        return (
          <View
            key={b.kod}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: sol,
              top: 44 + u.y - 18,
              width: genislik,
              alignItems: solda ? 'flex-end' : sagda ? 'flex-start' : 'center',
            }}
          >
            <Metin varyant="kucuk" numberOfLines={1}>
              {b.ad}
            </Metin>
            <Metin varyant="etiket" numberOfLines={1}>
              {b.puan}
            </Metin>
          </View>
        );
      })}
    </View>
  );
}
