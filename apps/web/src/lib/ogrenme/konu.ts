import type { Konu } from '@kopru/contracts';

/** Turkce harf duyarsiz karsilastirma metni (`İ/ı/I/i`, `ç ğ ö ş ü` -> ASCII benzeri). */
export function trNormalle(s: string): string {
  return s
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export interface KonuDugumu {
  konu: Konu;
  /** Ust > alt sirasinda (unite > konu > alt konu) cocuklar. */
  cocuklar: KonuDugumu[];
}

export interface KonuSuzgeci {
  katalog?: string;
  brans?: string;
  arama?: string;
  /** Kullanimdan kalkan/arsivli konular da gelsin (yonetim ekrani); secicide hayir. */
  kalkanlariGoster?: boolean;
}

/** Duz konu listesini unite > konu > alt konu agacina cevirir; `sira` sonra Turkce ad sirasi. */
export function konuAgaci(konular: readonly Konu[]): KonuDugumu[] {
  const dugumler = new Map<string, KonuDugumu>(
    konular.map((k) => [k.id, { konu: k, cocuklar: [] }]),
  );
  const kokler: KonuDugumu[] = [];
  for (const d of dugumler.values()) {
    const ust = d.konu.ust_id ? dugumler.get(d.konu.ust_id) : undefined;
    (ust ? ust.cocuklar : kokler).push(d);
  }
  const sirala = (liste: KonuDugumu[]) => {
    liste.sort((a, b) => a.konu.sira - b.konu.sira || a.konu.ad.localeCompare(b.konu.ad, 'tr'));
    for (const d of liste) sirala(d.cocuklar);
  };
  sirala(kokler);
  return kokler;
}

/**
 * Suzgeci uygular ve agaci budar: bir dugum, kendisi eslesirse ya da bir torunu eslesirse kalir
 * (eslesen torunun atalari baglam icin gorunur). Kullanimdan kalkan konular `kalkanlariGoster`
 * yoksa atilir.
 */
export function agaciSuz(agac: readonly KonuDugumu[], suzgec: KonuSuzgeci): KonuDugumu[] {
  const q = suzgec.arama ? trNormalle(suzgec.arama) : '';
  const gez = (d: KonuDugumu): KonuDugumu | null => {
    const k = d.konu;
    if (!suzgec.kalkanlariGoster && k.kullanimdan_kalkti) return null;
    if (suzgec.katalog && k.katalog_kodu !== suzgec.katalog) return null;
    if (suzgec.brans && k.brans_kodu !== suzgec.brans) return null;
    const cocuklar = d.cocuklar.map(gez).filter((x): x is KonuDugumu => x !== null);
    const kendi = q === '' || trNormalle(k.ad).includes(q);
    if (!kendi && cocuklar.length === 0) return null;
    return { konu: k, cocuklar };
  };
  return agac.map(gez).filter((x): x is KonuDugumu => x !== null);
}

/** Agaci, her satirda derinlikle duzlestirir (secici listesi icin). */
export function agaciDuzlestir(
  agac: readonly KonuDugumu[],
  derinlik = 0,
): { konu: Konu; derinlik: number }[] {
  return agac.flatMap((d) => [
    { konu: d.konu, derinlik },
    ...agaciDuzlestir(d.cocuklar, derinlik + 1),
  ]);
}

/** Konunun unite > konu > alt konu yolunu (`Ust › Konu`) metin olarak verir. */
export function konuYolu(konu: Konu, tum: ReadonlyMap<string, Konu>): string {
  const parcalar = [konu.ad];
  let ust = konu.ust_id ? tum.get(konu.ust_id) : undefined;
  while (ust) {
    parcalar.unshift(ust.ad);
    ust = ust.ust_id ? tum.get(ust.ust_id) : undefined;
  }
  return parcalar.join(' › ');
}

// --- Son kullanilanlar (yerel, tarayicida) -------------------------------------------------------

const ANAHTAR = (kurumId: string) => `kopru.sonKonular.${kurumId}`;
const SINIR = 6;

export function sonKonulariOku(kurumId: string): string[] {
  try {
    const ham = globalThis.localStorage.getItem(ANAHTAR(kurumId));
    const dizi: unknown = ham ? JSON.parse(ham) : [];
    return Array.isArray(dizi) ? dizi.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** En son secileni basa alir; en fazla 6 tutar. Depolama yoksa sessizce vazgecer. */
export function sonKonuEkle(kurumId: string, konuId: string): string[] {
  const yeni = [konuId, ...sonKonulariOku(kurumId).filter((x) => x !== konuId)].slice(0, SINIR);
  try {
    globalThis.localStorage.setItem(ANAHTAR(kurumId), JSON.stringify(yeni));
  } catch {
    /* depolama kapali: yalniz oturum icinde calisir */
  }
  return yeni;
}
