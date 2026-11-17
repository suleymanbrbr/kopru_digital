import { t } from '@kopru/i18n';

export interface RadarBeceri {
  kod: string;
  ad: string;
  puan: number;
}

export interface RadarNokta {
  x: number;
  y: number;
}

/** Olcek ust siniri: en az 10, en yuksek puani kapsayan ilk 10'un kati. */
export function radarOlcegi(beceriler: readonly RadarBeceri[]): number {
  const en = beceriler.reduce((m, b) => Math.max(m, b.puan), 0);
  return Math.max(10, Math.ceil(en / 10) * 10);
}

/** Tepe `i`nin acisi: ust ortadan baslayip saat yonunde (radyan). */
function aci(i: number, n: number): number {
  return -Math.PI / 2 + (2 * Math.PI * i) / n;
}

/** Bir tepe noktasi (`oran` 0..1, merkezden yaricap orani). */
export function radarNoktasi(
  i: number,
  n: number,
  oran: number,
  merkez: number,
  yaricap: number,
): RadarNokta {
  const a = aci(i, n);
  const r = yaricap * Math.min(Math.max(oran, 0), 1);
  return { x: merkez + r * Math.cos(a), y: merkez + r * Math.sin(a) };
}

/** Beceri cokgeninin tepe noktalari (puan / olcek orani). */
export function radarCokgeni(
  beceriler: readonly RadarBeceri[],
  merkez: number,
  yaricap: number,
  olcek = radarOlcegi(beceriler),
): RadarNokta[] {
  return beceriler.map((b, i) =>
    radarNoktasi(i, beceriler.length, b.puan / olcek, merkez, yaricap),
  );
}

/** Izgara halkasi (`oran` yaricapta duzgun cokgen). */
export function radarHalkasi(
  n: number,
  oran: number,
  merkez: number,
  yaricap: number,
): RadarNokta[] {
  return Array.from({ length: n }, (_, i) => radarNoktasi(i, n, oran, merkez, yaricap));
}

/** SVG `points` ozelligi. */
export function noktalarMetni(noktalar: readonly RadarNokta[]): string {
  return noktalar.map((n) => `${n.x.toFixed(1)},${n.y.toFixed(1)}`).join(' ');
}

/** Ekran okuyucu alternatifi: "Beceriler: Sayısal 12, Sözel 3, ..." (grafik renge/sekle bagli degil). */
export function radarMetni(beceriler: readonly RadarBeceri[]): string {
  const liste = beceriler.map((b) => `${b.ad} ${String(b.puan)}`).join(', ');
  return t('mobil.motivasyon.radar.etiket', { liste });
}
