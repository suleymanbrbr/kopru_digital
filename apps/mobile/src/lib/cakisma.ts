import type { CakisanDers } from '../api/operasyonTipleri';
import { ApiHata } from '../api/tipler';
import { kv } from '../depo/kv';

/**
 * `409 ders_cakismasi` hatasinin `details.cakisanlar` alanindan cakisan dersleri okur
 * (api snake_case dondurur). Beklenmeyen bicimde bos liste doner.
 */
export function cakisanDersleriOku(e: unknown): CakisanDers[] | null {
  if (!(e instanceof ApiHata) || e.ayrinti !== 'ders_cakismasi') return null;
  const detay = e.detay as { cakisanlar?: unknown } | undefined;
  if (!detay || !Array.isArray(detay.cakisanlar)) return [];
  const liste: CakisanDers[] = [];
  for (const x of detay.cakisanlar as Record<string, unknown>[]) {
    if (typeof x.id !== 'string') continue;
    liste.push({
      id: x.id,
      grupId: typeof x.grup_id === 'string' ? x.grup_id : '',
      baslik: typeof x.baslik === 'string' ? x.baslik : null,
      baslangic: typeof x.baslangic_at === 'string' ? x.baslangic_at : '',
      bitis: typeof x.bitis_at === 'string' ? x.bitis_at : '',
    });
  }
  return liste;
}

/** Hatali bir deger yazmak/okumak ekrani bozmasin: kalici tercih okuma/yazma korumali. */
export function hatirlananiOku(anahtar: string): string | null {
  try {
    return kv().getString(anahtar) ?? null;
  } catch {
    return null;
  }
}

export function hatirla(anahtar: string, deger: string): void {
  try {
    kv().set(anahtar, deger);
  } catch {
    // tercih kaydedilemedi: sorun degil
  }
}
