import type { AboneligiTipi, PlanLimitiDetay } from '@kopru/contracts';

const GUN_MS = 86_400_000;

/** T.C. kimlik no: 11 hane, ilk hane 0 degil, 10. ve 11. hane sağlama basamagi. */
export function tcknGecerliMi(deger: string): boolean {
  if (!/^[1-9][0-9]{10}$/.test(deger)) return false;
  const d = Array.from(deger, Number);
  const tek = (d[0] ?? 0) + (d[2] ?? 0) + (d[4] ?? 0) + (d[6] ?? 0) + (d[8] ?? 0);
  const cift = (d[1] ?? 0) + (d[3] ?? 0) + (d[5] ?? 0) + (d[7] ?? 0);
  const onuncu = (((tek * 7 - cift) % 10) + 10) % 10;
  const toplam = d.slice(0, 10).reduce((a, b) => a + b, 0);
  return onuncu === d[9] && toplam % 10 === d[10];
}

/** Vergi kimlik no (VKN): 10 hane, GIB sağlama basamagi algoritmasi. */
export function vknGecerliMi(deger: string): boolean {
  if (!/^[0-9]{10}$/.test(deger)) return false;
  const d = Array.from(deger, Number);
  let toplam = 0;
  for (let i = 0; i < 9; i++) {
    const tmp = ((d[i] ?? 0) + (9 - i)) % 10;
    let v = (tmp * 2 ** (9 - i)) % 9;
    if (tmp !== 0 && v === 0) v = 9;
    toplam += v;
  }
  return (10 - (toplam % 10)) % 10 === d[9];
}

export const vergiNoGecerliMi = (deger: string): boolean =>
  deger.length === 11 ? tcknGecerliMi(deger) : vknGecerliMi(deger);

export interface FaturaFormu {
  unvan: string;
  vergiNo: string;
  vergiDairesi: string;
  satir: string;
  ilce: string;
  il: string;
  postaKodu: string;
  eposta: string;
  eFatura: boolean;
}

export type FaturaFormHatalari = Partial<
  Record<'unvan' | 'vergiNo' | 'adres' | 'ilce' | 'il' | 'postaKodu' | 'eposta', true>
>;

/** Form hatalari (alan -> true); bos nesne = gecerli. Metinler i18n'de alan adina gore. */
export function faturaFormunuDogrula(f: FaturaFormu): FaturaFormHatalari {
  const h: FaturaFormHatalari = {};
  if (!f.unvan.trim()) h.unvan = true;
  if (!vergiNoGecerliMi(f.vergiNo.trim())) h.vergiNo = true;
  if (!f.satir.trim()) h.adres = true;
  if (!f.ilce.trim()) h.ilce = true;
  if (!f.il.trim()) h.il = true;
  if (f.postaKodu.trim() && !/^[0-9]{5}$/.test(f.postaKodu.trim())) h.postaKodu = true;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.eposta.trim())) h.eposta = true;
  return h;
}

/** `iso` aniyla `simdi` arasinda kalan tam gun (yukari yuvarlanir; gecmis icin 0). */
export function kalanGun(iso: string, simdi: number): number {
  const fark = new Date(iso).getTime() - simdi;
  return fark <= 0 ? 0 : Math.ceil(fark / GUN_MS);
}

/** Sahibe "deneme bitiyor" afisi: deneme surerken kalan gun <= 3. */
export function denemeAfisiGun(
  abonelik: Pick<AboneligiTipi, 'durum' | 'deneme_bitis_at'> | null,
  simdi: number,
): number | null {
  if (abonelik?.durum !== 'deneme' || !abonelik.deneme_bitis_at) return null;
  const bitis = new Date(abonelik.deneme_bitis_at).getTime();
  if (bitis <= simdi) return null;
  const gun = kalanGun(abonelik.deneme_bitis_at, simdi);
  return gun <= 3 ? gun : null;
}

/** Yuzde (0-100) ve esik: sinirsizsa null. */
export function kullanimOrani(mevcut: number, ust: number | null): number | null {
  if (ust === null) return null;
  if (ust <= 0) return 100;
  return Math.min(100, Math.round((mevcut / ust) * 100));
}

export type KullanimSeviyesi = 'normal' | 'yaklasti' | 'dolu';
export function kullanimSeviyesi(mevcut: number, ust: number | null): KullanimSeviyesi {
  if (ust === null) return 'normal';
  if (mevcut >= ust) return 'dolu';
  return mevcut / ust >= 0.8 ? 'yaklasti' : 'normal';
}

/** `402 plan_limiti` hata detayini guvenle cozer; bicim tutmuyorsa null. */
export function planLimitiDetayi(detaylar: unknown): PlanLimitiDetay | null {
  if (typeof detaylar !== 'object' || detaylar === null) return null;
  const d = detaylar as Record<string, unknown>;
  if (
    (d.limit === 'max_ogrenci' || d.limit === 'max_ogretmen') &&
    typeof d.mevcut === 'number' &&
    typeof d.ust_sinir === 'number'
  ) {
    return { limit: d.limit, mevcut: d.mevcut, ust_sinir: d.ust_sinir };
  }
  return null;
}

export type OdemeSonucu = 'basarili' | 'basarisiz' | 'bekliyor' | 'hata' | 'bulunamadi';
const SONUCLAR: readonly string[] = ['basarili', 'basarisiz', 'bekliyor', 'hata', 'bulunamadi'];

/** `?odeme=` sorgu degerini cozer; bilinmeyen deger yok sayilir. */
export function odemeSonucuCoz(deger: string | null): OdemeSonucu | null {
  return deger !== null && SONUCLAR.includes(deger) ? (deger as OdemeSonucu) : null;
}

/** Odeme sonrasi yoklama: abonelik aktif iyzico degilse (ya da donem/odeme degismediyse) beklenir. */
export function aktivasyonTamam(abonelik: Pick<AboneligiTipi, 'durum' | 'kaynak'> | null): boolean {
  return abonelik?.durum === 'aktif' && abonelik.kaynak === 'iyzico';
}

/** Saglayici adresi yalniz http(s) ise gidilir (javascript: vb. reddedilir). */
export function guvenliYonlendirme(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, 'http://yerel.invalid');
    return u.protocol === 'https:' || u.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}
