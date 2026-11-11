import type { DenemeKuraliTipi } from '@kopru/contracts';

import { bolumDogrula, netHesapla, type BolumHatasi } from './net';

/**
 * Grup icin tablo gorunumunde hizli deneme girisi: satir = ogrenci, sutun = bolum x (dogru, yanlis).
 * Bos satir atlanir; dolu satirda her bolum dogrulanir. Net yalniz gosterim onizlemesidir.
 */

export interface HucreCifti {
  dogru: string;
  yanlis: string;
}

/** `bolum_kodu` -> hucreler. */
export type TabloSatiri = Record<string, HucreCifti>;

export const bosHucre: HucreCifti = { dogru: '', yanlis: '' };

export const satirDolu = (s: TabloSatiri): boolean =>
  Object.values(s).some((h) => h.dogru.trim() !== '' || h.yanlis.trim() !== '');

/** Bolum bazinda hata (yalniz hata olan bolumler). Bos hucreler 0 sayilir. */
export function satirHatalari(
  kural: Pick<DenemeKuraliTipi, 'bolumler'>,
  satir: TabloSatiri,
): Record<string, Exclude<BolumHatasi, null>> {
  const sonuc: Record<string, Exclude<BolumHatasi, null>> = {};
  for (const b of kural.bolumler) {
    const h = satir[b.bolum_kodu] ?? bosHucre;
    const hata = bolumDogrula(b.soru_sayisi, h.dogru, h.yanlis, '');
    if (hata) sonuc[b.bolum_kodu] = hata;
  }
  return sonuc;
}

/** Satirin toplam net onizlemesi; hata varsa ya da satir bossa `null`. */
export function satirNeti(
  kural: Pick<DenemeKuraliTipi, 'bolumler' | 'yanlis_katsayisi'>,
  satir: TabloSatiri,
): number | null {
  if (!satirDolu(satir) || Object.keys(satirHatalari(kural, satir)).length > 0) return null;
  let toplam = 0;
  for (const b of kural.bolumler) {
    const h = satir[b.bolum_kodu] ?? bosHucre;
    toplam += netHesapla(Number(h.dogru || 0), Number(h.yanlis || 0), kural.yanlis_katsayisi);
  }
  return Math.round(toplam * 100) / 100;
}

export interface TopluGonderim {
  satirlar: {
    ogrenci_id: string;
    bolumler: { bolum_kodu: string; dogru: number; yanlis: number }[];
  }[];
  /** Hatali dolu satirlarin ogrenci kimlikleri; bos birakilmadan gonderilemez. */
  hatali: string[];
}

/** Dolu satirlari `POST /denemeler/toplu` govdesine cevirir; bos satirlar atlanir. */
export function tabloGonderimi(
  kural: Pick<DenemeKuraliTipi, 'bolumler'>,
  satirlar: Readonly<Record<string, TabloSatiri>>,
): TopluGonderim {
  const sonuc: TopluGonderim = { satirlar: [], hatali: [] };
  for (const [ogrenciId, satir] of Object.entries(satirlar)) {
    if (!satirDolu(satir)) continue;
    if (Object.keys(satirHatalari(kural, satir)).length > 0) {
      sonuc.hatali.push(ogrenciId);
      continue;
    }
    sonuc.satirlar.push({
      ogrenci_id: ogrenciId,
      bolumler: kural.bolumler.map((b) => {
        const h = satir[b.bolum_kodu] ?? bosHucre;
        return {
          bolum_kodu: b.bolum_kodu,
          dogru: Number(h.dogru || 0),
          yanlis: Number(h.yanlis || 0),
        };
      }),
    });
  }
  return sonuc;
}

export interface HucreKonumu {
  satir: number;
  sutun: number;
}

/**
 * Klavye ile hucre gezinmesi: oklar, Enter (asagi), Shift+Enter (yukari). Sinirda yerinde kalir.
 * `Tab` tarayicinin dogal sirasina birakilir (sola/saga ile ayni sonuc).
 */
export function hucreHareketi(
  konum: HucreKonumu,
  tus: string,
  satirSayisi: number,
  sutunSayisi: number,
  shift = false,
): HucreKonumu {
  const sinirla = (n: number, ust: number) => Math.min(Math.max(n, 0), Math.max(ust - 1, 0));
  switch (tus) {
    case 'ArrowDown':
      return { ...konum, satir: sinirla(konum.satir + 1, satirSayisi) };
    case 'ArrowUp':
      return { ...konum, satir: sinirla(konum.satir - 1, satirSayisi) };
    case 'ArrowRight':
      return { ...konum, sutun: sinirla(konum.sutun + 1, sutunSayisi) };
    case 'ArrowLeft':
      return { ...konum, sutun: sinirla(konum.sutun - 1, sutunSayisi) };
    case 'Enter':
      return { ...konum, satir: sinirla(konum.satir + (shift ? -1 : 1), satirSayisi) };
    default:
      return konum;
  }
}
