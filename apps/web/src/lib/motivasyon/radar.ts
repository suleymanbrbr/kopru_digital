export interface RadarNoktasi {
  kod: string;
  ad: string;
  puan: number;
  /** Merkezden uzaklik orani (0-1), eksenlerin en yuksek puanina gore. */
  oran: number;
  x: number;
  y: number;
  /** Etiket konumu (eksenin biraz disi). */
  etiketX: number;
  etiketY: number;
}

export interface RadarVerisi {
  noktalar: RadarNoktasi[];
  /** Cokgenin `points` degeri. */
  cokgen: string;
  /** Kilavuz halkalari (ic ice cokgenler), disarida olan sonda. */
  halkalar: string[];
  /** Eksen cizgilerinin uc noktalari. */
  eksenler: { x: number; y: number }[];
  /** Eksen olcegi: tum puanlari kapsayan en kucuk "yuvarlak" ust sinir. */
  ustSinir: number;
}

const KADEMELER = [50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000];

/** Eksen ust siniri: en yuksek puani kapsayan sonraki yuvarlak deger (en az 50). */
export function radarUstSiniri(puanlar: readonly number[]): number {
  const enYuksek = Math.max(0, ...puanlar);
  return KADEMELER.find((k) => k >= enYuksek) ?? Math.ceil(enYuksek / 1000) * 1000;
}

const yaz = (n: number) => String(Math.round(n * 100) / 100);

/**
 * Beceri puanlarini `boyut` x `boyut` kutuda bir radar (n-gen) geometrisine cevirir. Ilk eksen yukari
 * bakar, saat yonunde ilerler. SVG `viewBox` ile olceklendigi icin birimler goreli.
 */
export function radarHesapla(
  beceriler: readonly { kod: string; ad: string; puan: number }[],
  boyut = 240,
  halkaSayisi = 4,
): RadarVerisi {
  const n = Math.max(beceriler.length, 1);
  const merkez = boyut / 2;
  const yaricap = boyut / 2 - 44;
  const ustSinir = radarUstSiniri(beceriler.map((b) => b.puan));
  const aci = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const nokta = (i: number, oran: number, ek = 0) => ({
    x: merkez + Math.cos(aci(i)) * (yaricap * oran + ek),
    y: merkez + Math.sin(aci(i)) * (yaricap * oran + ek),
  });

  const noktalar = beceriler.map((b, i) => {
    const oran = Math.min(1, b.puan / ustSinir);
    const p = nokta(i, oran);
    const e = nokta(i, 1, 20);
    return { kod: b.kod, ad: b.ad, puan: b.puan, oran, x: p.x, y: p.y, etiketX: e.x, etiketY: e.y };
  });
  const halkalar = Array.from({ length: halkaSayisi }, (_, h) => {
    const oran = (h + 1) / halkaSayisi;
    return beceriler
      .map((_, i) => {
        const p = nokta(i, oran);
        return `${yaz(p.x)},${yaz(p.y)}`;
      })
      .join(' ');
  });
  return {
    noktalar,
    cokgen: noktalar.map((p) => `${yaz(p.x)},${yaz(p.y)}`).join(' '),
    halkalar,
    eksenler: beceriler.map((_, i) => nokta(i, 1)),
    ustSinir,
  };
}
