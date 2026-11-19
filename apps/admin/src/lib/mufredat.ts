import type { Konu, KatalogKodu } from './tipler';

export const KATALOG_KODLARI: readonly KatalogKodu[] = ['lgs', 'tyt', 'ayt', 'ydt', 'okul'];

export type Seviye = Konu['seviye'];
/** unite > konu > alt_konu: kucuk sayi ust seviye. */
export const SEVIYE_SIRA: Record<Seviye, number> = { unite: 0, konu: 1, alt_konu: 2 };

export interface AgacDugumu {
  konu: Konu;
  derinlik: number;
  cocuklar: AgacDugumu[];
}

const sirala = (a: Konu, b: Konu) => a.sira - b.sira || a.ad.localeCompare(b.ad, 'tr');

/**
 * Duz konu listesini agaca cevirir. Ustu listede olmayan konu (ust konu bu surumde kapali ya da
 * filtreli) kok sayilir. Kardesler `sira`, sonra ada gore dizilir.
 */
export function agacKur(konular: readonly Konu[]): AgacDugumu[] {
  const idler = new Set(konular.map((k) => k.id));
  const cocukHaritasi = new Map<string, Konu[]>();
  const kokler: Konu[] = [];
  for (const k of konular) {
    if (k.ust_id && idler.has(k.ust_id)) {
      const liste = cocukHaritasi.get(k.ust_id) ?? [];
      liste.push(k);
      cocukHaritasi.set(k.ust_id, liste);
    } else {
      kokler.push(k);
    }
  }
  const kur = (k: Konu, derinlik: number, goruldu: Set<string>): AgacDugumu => {
    goruldu.add(k.id);
    return {
      konu: k,
      derinlik,
      cocuklar: (cocukHaritasi.get(k.id) ?? [])
        .filter((c) => !goruldu.has(c.id))
        .sort(sirala)
        .map((c) => kur(c, derinlik + 1, goruldu)),
    };
  };
  return kokler.sort(sirala).map((k) => kur(k, 0, new Set()));
}

/** Agaci derinlik sirasiyla (ust once) duz listeye acar. */
export function duzles(dugumler: readonly AgacDugumu[]): AgacDugumu[] {
  return dugumler.flatMap((d) => [d, ...duzles(d.cocuklar)]);
}

/** `id` konusunun tum alt konulari (kendisi haric). */
export function altlari(konular: readonly Konu[], id: string): Set<string> {
  const sonuc = new Set<string>();
  const kuyruk = [id];
  while (kuyruk.length > 0) {
    const su = kuyruk.pop();
    if (su === undefined) break;
    for (const k of konular) {
      if (k.ust_id === su && !sonuc.has(k.id)) {
        sonuc.add(k.id);
        kuyruk.push(k.id);
      }
    }
  }
  return sonuc;
}

/** Taşıma icin uygun ust konular: ayni brans, daha ust seviye, kendisi ve alt konulari degil. */
export function uygunUstler(konular: readonly Konu[], konu: Konu): Konu[] {
  const yasak = altlari(konular, konu.id);
  return konular
    .filter(
      (k) =>
        k.id !== konu.id &&
        !yasak.has(k.id) &&
        k.brans_kodu === konu.brans_kodu &&
        SEVIYE_SIRA[k.seviye] < SEVIYE_SIRA[konu.seviye],
    )
    .sort(sirala);
}

/** Birlestirme hedefleri: ayni brans ve seviye, kendisi degil. */
export function uygunHedefler(konular: readonly Konu[], konu: Konu): Konu[] {
  return konular
    .filter((k) => k.id !== konu.id && k.brans_kodu === konu.brans_kodu && k.seviye === konu.seviye)
    .sort(sirala);
}

/** Yeni konu icin uygun ust konular (daha ust seviye, ayni brans). */
export function eklemeUstleri(konular: readonly Konu[], seviye: Seviye, brans: string): Konu[] {
  return konular
    .filter((k) => k.brans_kodu === brans && SEVIYE_SIRA[k.seviye] < SEVIYE_SIRA[seviye])
    .sort(sirala);
}

/** Agaci branşa gore gruplar (dizi sirasi korunur). */
export function bransGrupla(dugumler: readonly AgacDugumu[]): [string, AgacDugumu[]][] {
  const harita = new Map<string, AgacDugumu[]>();
  for (const d of dugumler) {
    const liste = harita.get(d.konu.brans_kodu) ?? [];
    liste.push(d);
    harita.set(d.konu.brans_kodu, liste);
  }
  return [...harita.entries()];
}
