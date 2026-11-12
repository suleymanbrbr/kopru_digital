import { Skia, type SkPath } from '@shopify/react-native-skia';

import type { Cizgi, Nokta } from './model';

/**
 * Noktalardan Skia yolu. Dokunmatik ornekleme sikligi (~60-120 Hz) ve yuvarlak uc/birlesimlerle
 * ardisik dogrular yumusak gorunur; canli cizim ve kayitli cizgiler ayni yolu kullanir (kalem
 * kalktiginda goruntu degismez). `g`/`y`: koordinat uzayi (px); noktalar 0..1'dir.
 */
export function yolOlustur(noktalar: readonly Nokta[], g: number, y: number): SkPath {
  const yol = Skia.PathBuilder.Make();
  const ilk = noktalar[0];
  if (!ilk) return yol.build();
  yol.moveTo(ilk.x * g, ilk.y * y);
  if (noktalar.length === 1) {
    // Tek dokunus: yuvarlak uclu, sifire yakin uzunlukta cizgi nokta olarak gorunur.
    yol.lineTo(ilk.x * g + 0.01, ilk.y * y);
    return yol.build();
  }
  for (const p of noktalar.slice(1)) yol.lineTo(p.x * g, p.y * y);
  return yol.build();
}

export const cizgiPx = (c: Cizgi, genislik: number) => (c.kalinlik / 10_000) * genislik;
