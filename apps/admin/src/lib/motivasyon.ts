import { tr } from '@kopru/i18n';

import { kodAdi } from './bicim';
import type { AyarDegerleri } from './tipler';

/** Formdaki degerler: sayilar metin olarak tutulur (bos / yarim giris olabilsin). */
export interface KuralFormu {
  xp: string;
  olay: string;
  carpan: string;
  aktif: boolean;
}
export interface AyarFormu {
  kurallar: Record<string, KuralFormu>;
  tavanlar: Record<string, string>;
}

export function formaCevir(d: AyarDegerleri): AyarFormu {
  return {
    kurallar: Object.fromEntries(
      Object.entries(d.kurallar).map(([kod, k]) => [
        kod,
        {
          xp: String(k.xp),
          olay: k.olay_basi_ust_sinir === null ? '' : String(k.olay_basi_ust_sinir),
          carpan: String(k.gec_carpani),
          aktif: k.aktif,
        },
      ]),
    ),
    tavanlar: Object.fromEntries(Object.entries(d.tavanlar).map(([kod, v]) => [kod, String(v)])),
  };
}

/** `PUT /platform/motivasyon/ayarlar` govdesinin degisiklik kismi (yalniz degisenler). */
export interface Degisiklikler {
  kurallar: Record<
    string,
    Partial<{ xp: number; olay_basi_ust_sinir: number | null; gec_carpani: number; aktif: boolean }>
  >;
  tavanlar: Record<string, number>;
  /** Sayiya cevrilemeyen alanlar (`kurallar.<kod>.xp`, ...) -> kullaniciya gosterilecek ad. */
  gecersiz: string[];
}

const sayi = (m: string): number => (m.trim() === '' ? Number.NaN : Number(m.replace(',', '.')));

/** Formu gecerli degerlerle karsilastirir; degisen alanlari ve cevrilemeyenleri dondurur. */
export function degisiklikleriBul(form: AyarFormu, gecerli: AyarDegerleri): Degisiklikler {
  const sonuc: Degisiklikler = { kurallar: {}, tavanlar: {}, gecersiz: [] };
  for (const [kod, f] of Object.entries(form.kurallar)) {
    const g = gecerli.kurallar[kod];
    if (!g) continue;
    const parca: Degisiklikler['kurallar'][string] = {};
    const xp = sayi(f.xp);
    if (Number.isNaN(xp)) sonuc.gecersiz.push(`kurallar.${kod}.xp`);
    else if (xp !== g.xp) parca.xp = xp;

    const olay = f.olay.trim() === '' ? null : sayi(f.olay);
    if (olay !== null && Number.isNaN(olay))
      sonuc.gecersiz.push(`kurallar.${kod}.olay_basi_ust_sinir`);
    else if (olay !== g.olay_basi_ust_sinir) parca.olay_basi_ust_sinir = olay;

    const carpan = sayi(f.carpan);
    if (Number.isNaN(carpan)) sonuc.gecersiz.push(`kurallar.${kod}.gec_carpani`);
    else if (carpan !== g.gec_carpani) parca.gec_carpani = carpan;

    if (f.aktif !== g.aktif) parca.aktif = f.aktif;
    if (Object.keys(parca).length > 0) sonuc.kurallar[kod] = parca;
  }
  for (const [kod, m] of Object.entries(form.tavanlar)) {
    const v = sayi(m);
    if (Number.isNaN(v)) sonuc.gecersiz.push(`tavanlar.${kod}`);
    else if (v !== gecerli.tavanlar[kod]) sonuc.tavanlar[kod] = v;
  }
  return sonuc;
}

export function degisiklikSayisi(d: Degisiklikler): number {
  return (
    Object.values(d.kurallar).reduce((a, k) => a + Object.keys(k).length, 0) +
    Object.keys(d.tavanlar).length
  );
}

const KURAL_ADLARI = tr.yonetim.motivasyon.kural as Record<string, string>;
const TAVAN_ADLARI = tr.yonetim.motivasyon.tavan as Record<string, string>;
export const kuralAdi = (kod: string): string => KURAL_ADLARI[kod] ?? kodAdi(kod);
export const tavanAdi = (kod: string): string => TAVAN_ADLARI[kod] ?? kodAdi(kod);

/** Sunucunun alan yolundan (`kurallar.yoklama_geldi.xp`) alan basina hata haritasi. */
export function alanHataHaritasi(
  hatalar: readonly { alan: string; mesaj: string }[],
): Record<string, string> {
  const h: Record<string, string> = {};
  for (const e of hatalar) h[e.alan] = h[e.alan] ? `${h[e.alan] ?? ''} ${e.mesaj}` : e.mesaj;
  return h;
}
