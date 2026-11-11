import { t } from '@kopru/i18n';

import type { DenemeGelisimi } from '../api/ogrenmeTipleri';
import { bransAdi } from './konu';
import { netBicimle } from './net';

export interface SeriNoktasi {
  etiket: string;
  deger: number;
}

/** Toplam net serisi (eskiden yeniye). */
export function toplamSerisi(g: DenemeGelisimi): SeriNoktasi[] {
  return g.noktalar.map((n) => ({ etiket: n.ad, deger: n.toplamNet }));
}

/** Tek bolumun net serisi; o bolumun verisi olmayan deneme atlanir. */
export function bolumSerisi(g: DenemeGelisimi, bolumKodu: string): SeriNoktasi[] {
  const seri: SeriNoktasi[] = [];
  for (const n of g.noktalar) {
    const b = n.bolumler.find((x) => x.bolumKodu === bolumKodu);
    if (b) seri.push({ etiket: n.ad, deger: b.net });
  }
  return seri;
}

export interface CizgiGrafigi {
  /** SVG `polyline` noktalari ("x,y x,y"). */
  noktalar: { x: number; y: number }[];
  yol: string;
  min: number;
  max: number;
}

/**
 * Degerleri `genislik x yukseklik` alana (kenar boslugu `pay`) olcekler. Tek nokta ortalanir; tum
 * degerler esitse cizgi ortada yatay durur. Eksen degerleri `min`/`max` ile gosterilir.
 */
export function cizgiGrafigiHazirla(
  degerler: readonly number[],
  genislik: number,
  yukseklik: number,
  pay = 12,
): CizgiGrafigi {
  if (degerler.length === 0) return { noktalar: [], yol: '', min: 0, max: 0 };
  const min = Math.min(...degerler);
  const max = Math.max(...degerler);
  const aralik = max - min;
  const icG = genislik - 2 * pay;
  const icY = yukseklik - 2 * pay;
  const noktalar = degerler.map((v, i) => ({
    x: degerler.length === 1 ? genislik / 2 : pay + (icG * i) / (degerler.length - 1),
    y: aralik === 0 ? yukseklik / 2 : pay + icY - (icY * (v - min)) / aralik,
  }));
  const yol = noktalar
    .map((n, i) => `${i === 0 ? 'M' : 'L'}${n.x.toFixed(1)} ${n.y.toFixed(1)}`)
    .join(' ');
  return { noktalar, yol, min, max };
}

function degisimMetni(d: number | null): string {
  if (d === null) return '';
  if (d === 0) return t('mobil.ogrenme.grafik.degismedi');
  return d > 0
    ? t('mobil.ogrenme.grafik.artis', { n: netBicimle(d) })
    : t('mobil.ogrenme.grafik.dusus', { n: netBicimle(-d) });
}

/**
 * Ekran okuyucu icin grafigin metin ozeti (gorsel tek bilgi kaynagi olmasin). `bolumKodu` null ise
 * toplam net, degilse o bolum anlatilir. Degerler kronolojik: ilk, son, en yuksek ve son 5 ortalama.
 */
export function grafikOzeti(g: DenemeGelisimi, bolumKodu: string | null): string {
  const seri = bolumKodu ? bolumSerisi(g, bolumKodu) : toplamSerisi(g);
  const baslik = bolumKodu
    ? t('mobil.ogrenme.grafik.bolumBaslik', {
        bolum: bransAdi(
          g.noktalar.flatMap((n) => n.bolumler).find((b) => b.bolumKodu === bolumKodu)?.bransKodu ??
            bolumKodu,
        ),
      })
    : t('mobil.ogrenme.grafik.toplamBaslik');
  if (seri.length === 0) return `${baslik}. ${t('mobil.ogrenme.grafik.veriYok')}`;
  const ilk = seri[0]?.deger ?? 0;
  const son = seri.at(-1)?.deger ?? 0;
  const enYuksek = Math.max(...seri.map((s) => s.deger));
  const parcalar = [
    baslik,
    t('mobil.ogrenme.grafik.denemeSayisi', { n: seri.length }),
    t('mobil.ogrenme.grafik.ilkSon', { ilk: netBicimle(ilk), son: netBicimle(son) }),
    t('mobil.ogrenme.grafik.enYuksek', { n: netBicimle(enYuksek) }),
  ];
  const ortalama = bolumKodu
    ? (g.bolumGelisimi.find((b) => b.bolumKodu === bolumKodu)?.son5Ortalama ?? null)
    : g.son5Ortalama;
  const degisim = bolumKodu
    ? (g.bolumGelisimi.find((b) => b.bolumKodu === bolumKodu)?.degisim ?? null)
    : g.degisim;
  if (ortalama !== null) {
    parcalar.push(
      t('mobil.ogrenme.grafik.son5', { n: netBicimle(ortalama) }) +
        (degisim !== null ? ` ${degisimMetni(degisim)}` : ''),
    );
  }
  return parcalar.join('. ') + '.';
}
