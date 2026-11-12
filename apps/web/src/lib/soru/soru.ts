import type { SoruDurum, SoruKota } from '@kopru/contracts';
import { z } from 'zod';

import { UygulamaHatasi } from '@/lib/api';

/** "Soru sor" ekranlarinin ortak yardimcilari (durum rozetleri, kota, tahmini sure, son secimler). */

export const SORU_DURUMLARI: readonly SoruDurum[] = [
  'acik',
  'cevaplandi',
  'takip_bekliyor',
  'cozuldu',
  'kapandi',
];

export type RozetTonu = 'notr' | 'basari' | 'uyari' | 'hata' | 'bilgi';

/** Durum -> rozet tonu. Renk tek basina anlam tasimaz: rozette metin her zaman vardir. */
export const DURUM_TONU: Record<SoruDurum, RozetTonu> = {
  acik: 'uyari',
  cevaplandi: 'bilgi',
  takip_bekliyor: 'uyari',
  cozuldu: 'basari',
  kapandi: 'notr',
};

/** Cevap bekleyen (ogretmen kuyrugu) durumlari. */
export const bekliyorMu = (d: SoruDurum): boolean => d === 'acik' || d === 'takip_bekliyor';

const KotaDetaySema = z.object({
  kota: z.object({
    gunluk_kalan: z.number().nullable().optional(),
    gunluk_sifirlanma_at: z.string().optional(),
    aylik_kalan: z.number().nullable().optional(),
    aylik_sifirlanma_at: z.string().optional(),
  }),
  kota_turu: z.enum(['gunluk', 'aylik']).optional(),
});

/** 429 `kota_asildi` hatasindan hangi kota dolduysa ve ne zaman sifirlanacagini cikarir. */
export function kotaHatasi(
  hata: unknown,
): { tur: 'gunluk' | 'aylik'; sifirlanma: string | null } | null {
  if (!(hata instanceof UygulamaHatasi) || hata.kod !== 'kota_asildi') return null;
  const d = KotaDetaySema.safeParse(hata.detaylar);
  if (!d.success) return { tur: 'gunluk', sifirlanma: null };
  const tur = d.data.kota_turu ?? 'gunluk';
  return {
    tur,
    sifirlanma:
      (tur === 'aylik' ? d.data.kota.aylik_sifirlanma_at : d.data.kota.gunluk_sifirlanma_at) ??
      null,
  };
}

/** Hangi kota (gunluk/aylik) daha kisitliysa onu dondurur; ikisi de sinirsizsa `null`. */
export function kotaOzeti(
  k: SoruKota,
): { tur: 'gunluk' | 'aylik'; kalan: number; limit: number; sifirlanma: string } | null {
  const adaylar: { tur: 'gunluk' | 'aylik'; kalan: number; limit: number; sifirlanma: string }[] =
    [];
  if (k.gunluk_kalan !== null && k.gunluk_limit !== null) {
    adaylar.push({
      tur: 'gunluk',
      kalan: k.gunluk_kalan,
      limit: k.gunluk_limit,
      sifirlanma: k.gunluk_sifirlanma_at,
    });
  }
  if (k.aylik_kalan !== null && k.aylik_limit !== null) {
    adaylar.push({
      tur: 'aylik',
      kalan: k.aylik_kalan,
      limit: k.aylik_limit,
      sifirlanma: k.aylik_sifirlanma_at,
    });
  }
  adaylar.sort((a, b) => a.kalan - b.kalan);
  return adaylar[0] ?? null;
}

/** Tahmini cevap suresi: "yaklasik 12 dakika" / "yaklasik 3 saat". Saniye bilinmiyorsa `null`. */
export function sureMetni(saniye: number): { birim: 'dakika' | 'saat' | 'gun'; n: number } {
  const dk = Math.max(1, Math.round(saniye / 60));
  if (dk < 60) return { birim: 'dakika', n: dk };
  const saat = Math.round(dk / 60);
  if (saat < 24) return { birim: 'saat', n: saat };
  return { birim: 'gun', n: Math.round(saat / 24) };
}

/** Basliga/notuna gore listede gosterilecek kisa metin. */
export function soruBasligi(s: { baslik: string | null; metin_onizleme: string | null }): string {
  return s.baslik ?? s.metin_onizleme ?? '';
}

// --- Son secilen brans/konu (yerel) -------------------------------------------------------------

const SON_ANAHTAR = 'kopru.soru.son-secim';
const SonSecimSema = z.object({ brans: z.string(), konuId: z.string().nullable() });
export type SonSecim = z.infer<typeof SonSecimSema>;

export function sonSecimiOku(kurumId: string): SonSecim | null {
  try {
    const ham = window.localStorage.getItem(`${SON_ANAHTAR}.${kurumId}`);
    if (!ham) return null;
    const s = SonSecimSema.safeParse(JSON.parse(ham));
    return s.success ? s.data : null;
  } catch {
    return null;
  }
}

export function sonSecimiYaz(kurumId: string, secim: SonSecim): void {
  try {
    window.localStorage.setItem(`${SON_ANAHTAR}.${kurumId}`, JSON.stringify(secim));
  } catch {
    // Depolama yok/dolu: oneri sessizce atlanir.
  }
}

// --- Zaman --------------------------------------------------------------------------------------

const GORELI = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' });

/** "3 saat önce", "dün" gibi goreli zaman (en buyuk anlamli birim). */
export function goreliZaman(iso: string, simdi: number = Date.now()): string {
  const fark = (Date.parse(iso) - simdi) / 1000;
  const mutlak = Math.abs(fark);
  if (mutlak < 60) return GORELI.format(0, 'second');
  if (mutlak < 3600) return GORELI.format(Math.round(fark / 60), 'minute');
  if (mutlak < 86_400) return GORELI.format(Math.round(fark / 3600), 'hour');
  return GORELI.format(Math.round(fark / 86_400), 'day');
}

/** Saniyeyi "2 sa 10 dk" / "45 dk" / "3 gün" gibi kisa metne cevirir; bilinmiyorsa `null`. */
export function sureKisa(saniye: number | null): string | null {
  if (saniye === null) return null;
  const dk = Math.round(saniye / 60);
  if (dk < 1) return "1 dk'dan az";
  if (dk < 60) return `${String(dk)} dk`;
  const saat = Math.floor(dk / 60);
  if (saat < 24)
    return dk % 60 === 0 ? `${String(saat)} sa` : `${String(saat)} sa ${String(dk % 60)} dk`;
  const gun = Math.floor(saat / 24);
  return saat % 24 === 0 ? `${String(gun)} gün` : `${String(gun)} gün ${String(saat % 24)} sa`;
}

/** 0..1 orani "%75" olarak yazar; bilinmiyorsa `null`. */
export function yuzdeMetni(oran: number | null): string | null {
  return oran === null ? null : `%${String(Math.round(oran * 100))}`;
}
