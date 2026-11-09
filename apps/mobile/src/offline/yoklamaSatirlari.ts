import type { NotGorunurluk, YoklamaDurumu, YoklamaSatiri } from '../api/operasyonTipleri';

export interface YoklamaSecimi {
  durum: YoklamaDurumu;
  /** `gec` icin dakika metni (1-240). */
  gecDakika?: string;
}

export const GEC_DAKIKA_MIN = 1;
export const GEC_DAKIKA_MAKS = 240;

/** `gec` dakikasi gecerli mi (tam sayi, 1-240)? */
export function gecDakikaGecerliMi(metin: string | undefined): boolean {
  if (!metin || !/^\d{1,3}$/.test(metin)) return false;
  const n = Number(metin);
  return n >= GEC_DAKIKA_MIN && n <= GEC_DAKIKA_MAKS;
}

export type SatirSonucu =
  { ok: true; satirlar: YoklamaSatiri[] } | { ok: false; hataliOgrenciIdleri: string[] };

/**
 * Secimlerden api satirlari kurar. `isaretlenmeAt` KAYDET'e dokunma aninda bir kez yakalanir
 * (`an`); cevrimdisi kuyruk ayni yuku her denemede aynen gonderir, zaman degismez.
 * Not bossa gonderilmez; gorunurluk varsayilani "bana ozel"dir.
 */
export function yoklamaSatirlariKur(
  secimler: Readonly<Record<string, YoklamaSecimi>>,
  secenek: { not: string; gorunurluk: NotGorunurluk; an: Date },
): SatirSonucu {
  const hatali: string[] = [];
  const satirlar: YoklamaSatiri[] = [];
  const not = secenek.not.trim();
  const isaretlenmeAt = secenek.an.toISOString();
  for (const [ogrenciId, s] of Object.entries(secimler)) {
    if (s.durum === 'gec' && !gecDakikaGecerliMi(s.gecDakika)) {
      hatali.push(ogrenciId);
      continue;
    }
    satirlar.push({
      ogrenciId,
      durum: s.durum,
      isaretlenmeAt,
      ...(s.durum === 'gec' ? { gecDakika: Number(s.gecDakika) } : {}),
      ...(not ? { not: not.slice(0, 500), notGorunurluk: secenek.gorunurluk } : {}),
    });
  }
  return hatali.length > 0 ? { ok: false, hataliOgrenciIdleri: hatali } : { ok: true, satirlar };
}
