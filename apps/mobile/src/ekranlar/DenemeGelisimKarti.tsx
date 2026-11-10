import { t } from '@kopru/i18n';
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgYazi } from 'react-native-svg';

import type { DenemeGelisimi } from '../api/ogrenmeTipleri';
import { bolumSerisi, cizgiGrafigiHazirla, grafikOzeti, toplamSerisi } from '../ogrenme/grafik';
import { bransAdi } from '../ogrenme/konu';
import { netBicimle } from '../ogrenme/net';
import { useTema } from '../tema/TemaSaglayici';
import { BosDurum } from '../ui/Durumlar';
import { Kart } from '../ui/Kart';
import { Metin } from '../ui/Metin';
import { Secici } from '../ui/Secici';

const YUKSEKLIK = 160;

/**
 * Cizgi grafigi (react-native-svg, animasyonsuz: "hareketi azalt" ayarindan etkilenmez). Grafik tek
 * bilgi kaynagi degildir: `accessibilityLabel` ozetin tamamini okur ve ayni metin altinda gorunur.
 */
function CizgiGrafigi({ degerler, ozet }: { degerler: number[]; ozet: string }) {
  const { renkler } = useTema();
  const [genislik, setGenislik] = useState(300);
  const g = cizgiGrafigiHazirla(degerler, genislik, YUKSEKLIK, 16);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={ozet}
      testID="deneme-grafigi"
      onLayout={(e) => {
        setGenislik(Math.max(e.nativeEvent.layout.width, 120));
      }}
    >
      <Svg width="100%" height={YUKSEKLIK} viewBox={`0 0 ${String(genislik)} ${String(YUKSEKLIK)}`}>
        <Line
          x1={16}
          y1={YUKSEKLIK - 16}
          x2={genislik - 16}
          y2={YUKSEKLIK - 16}
          stroke={renkler.kenar}
          strokeWidth={1}
        />
        <Path d={g.yol} stroke={renkler.birincil} strokeWidth={2.5} fill="none" />
        {g.noktalar.map((n, i) => (
          <Circle
            key={`${String(i)}-${String(n.x)}`}
            cx={n.x}
            cy={n.y}
            r={4}
            fill={renkler.yuzey}
            stroke={renkler.birincil}
            strokeWidth={2}
          />
        ))}
        {g.noktalar.length > 0 ? (
          <>
            <SvgYazi x={2} y={12} fontSize={11} fill={renkler.metinIkincil}>
              {netBicimle(g.max)}
            </SvgYazi>
            <SvgYazi x={2} y={YUKSEKLIK - 2} fontSize={11} fill={renkler.metinIkincil}>
              {netBicimle(g.min)}
            </SvgYazi>
          </>
        ) : null}
      </Svg>
    </View>
  );
}

/**
 * Deneme gelisimi: toplam net ya da secilen bolum trendi, son 5 ortalama ve onceki 5'e gore degisim.
 * Yalniz onayli denemeler gelir (sunucu). Baskasinin sonucu / sinif ortalamasi YOKTUR.
 */
export function DenemeGelisimKarti({ gelisim }: { gelisim: DenemeGelisimi }) {
  const [secim, setSecim] = useState<string>('toplam');
  const bolumler = gelisim.bolumGelisimi.filter((b) => bolumSerisi(gelisim, b.bolumKodu).length > 0);
  const bolumKodu = secim === 'toplam' ? null : secim;
  const seri = bolumKodu ? bolumSerisi(gelisim, bolumKodu) : toplamSerisi(gelisim);
  const ozet = grafikOzeti(gelisim, bolumKodu);

  if (gelisim.noktalar.length === 0) {
    return (
      <Kart testID="gelisim-bos">
        <BosDurum ikon="sparkles" mesaj={t('mobil.ogrenme.deneme.gelisimBos')} />
      </Kart>
    );
  }

  return (
    <Kart className="gap-3" testID="gelisim-karti">
      <Metin varyant="altBaslik" accessibilityRole="header">
        {t('mobil.ogrenme.deneme.gelisim')}
      </Metin>
      {bolumler.length > 0 ? (
        <Secici
          baslik={t('mobil.ogrenme.deneme.grafikSecim')}
          deger={secim}
          onDegis={setSecim}
          secenekler={[
            { deger: 'toplam', etiket: t('mobil.ogrenme.deneme.toplamNet') },
            ...bolumler.map((b) => ({ deger: b.bolumKodu, etiket: bransAdi(b.bransKodu) })),
          ]}
        />
      ) : null}
      <CizgiGrafigi degerler={seri.map((s) => s.deger)} ozet={ozet} />
      <Metin varyant="ikincil" testID="gelisim-ozeti">
        {ozet}
      </Metin>
      <View className="flex-row flex-wrap gap-x-6 gap-y-1">
        <Metin varyant="kucuk">
          {t('mobil.ogrenme.deneme.onayliSayisi', { n: gelisim.denemeSayisi })}
        </Metin>
      </View>
    </Kart>
  );
}
