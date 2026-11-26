import { t } from '@kopru/i18n';

import {
  BANT_EN_AZ_SORU,
  GUNLUK_SORU_EN_FAZLA_TOPLAM,
  ZORLUKLAR,
  type BantTespiti,
  type Hucre,
  type KonuAnalizi,
  type Zorluk,
} from '../api/gunlukSoruTipleri';
import type { KvDepo } from '../depo/kv';

// --- Form ----------------------------------------------------------------------------------

export type KaynakSecimi =
  | { tur: 'yok' }
  | { tur: 'test'; kitapId: string; kitapAd: string; testId: string; testAd: string }
  | { tur: 'metin'; metin: string };

export const KAYNAK_YOK: KaynakSecimi = { tur: 'yok' };

export interface SonSecim {
  bransKodu: string | null;
  konuId: string | null;
  zorluk: Zorluk | null;
  kaynak: KaynakSecimi;
}

export const SON_SECIM_BOS: SonSecim = {
  bransKodu: null,
  konuId: null,
  zorluk: null,
  kaynak: KAYNAK_YOK,
};

const sonSecimAnahtari = (uyelikId: string) => `kopru.gunluk-son-secim.${uyelikId}`;

function kaynakGecerliMi(k: unknown): k is KaynakSecimi {
  if (typeof k !== 'object' || k === null) return false;
  const o = k as Record<string, unknown>;
  if (o.tur === 'yok') return true;
  if (o.tur === 'metin') return typeof o.metin === 'string';
  return (
    o.tur === 'test' &&
    typeof o.kitapId === 'string' &&
    typeof o.kitapAd === 'string' &&
    typeof o.testId === 'string' &&
    typeof o.testAd === 'string'
  );
}

/** Cihazda hatirlanan son ders/konu/zorluk/kaynak (uyelik kapsamli; bozuk kayit bos sayilir). */
export function sonSecimOku(depo: KvDepo, uyelikId: string): SonSecim {
  try {
    const v = JSON.parse(
      depo.getString(sonSecimAnahtari(uyelikId)) ?? 'null',
    ) as Partial<SonSecim> | null;
    if (!v || typeof v !== 'object') return SON_SECIM_BOS;
    return {
      bransKodu: typeof v.bransKodu === 'string' ? v.bransKodu : null,
      konuId: typeof v.konuId === 'string' ? v.konuId : null,
      zorluk: v.zorluk && (ZORLUKLAR as readonly string[]).includes(v.zorluk) ? v.zorluk : null,
      kaynak: kaynakGecerliMi(v.kaynak) ? v.kaynak : KAYNAK_YOK,
    };
  } catch {
    return SON_SECIM_BOS;
  }
}

export function sonSecimYaz(depo: KvDepo, uyelikId: string, s: SonSecim): void {
  depo.set(sonSecimAnahtari(uyelikId), JSON.stringify(s));
}

export const toplamSoru = (dogru: number, yanlis: number, bos: number) => dogru + yanlis + bos;

export interface FormHatasi {
  ders?: boolean;
  konu?: boolean;
  zorluk?: boolean;
  toplam?: 'bos' | 'cok';
}

/** Zorunlu alanlar: ders, konu, zorluk ve en az 1 (en cok 500) soru. */
export function formDogrula(f: {
  bransKodu: string | null;
  konuId: string | null;
  zorluk: Zorluk | null;
  dogru: number;
  yanlis: number;
  bos: number;
}): FormHatasi {
  const h: FormHatasi = {};
  if (!f.bransKodu) h.ders = true;
  if (!f.konuId) h.konu = true;
  if (!f.zorluk) h.zorluk = true;
  const top = toplamSoru(f.dogru, f.yanlis, f.bos);
  if (top < 1) h.toplam = 'bos';
  else if (top > GUNLUK_SORU_EN_FAZLA_TOPLAM) h.toplam = 'cok';
  return h;
}

/** Sayi girisi metnini tam sayiya cevirir (bos/gecersiz -> 0); 0..500 araligina kisitlar. */
export function sayiAyikla(metin: string): number {
  const n = Number.parseInt(metin.replace(/\D/g, ''), 10);
  if (Number.isNaN(n)) return 0;
  return Math.min(n, GUNLUK_SORU_EN_FAZLA_TOPLAM);
}

/** `+`/`-` dugmesi: 0'in altina ve 500'un ustune inmez (tek alan 500'u asamaz). */
export function sayiDegistir(mevcut: number, fark: number): number {
  return Math.max(0, Math.min(GUNLUK_SORU_EN_FAZLA_TOPLAM, mevcut + fark));
}

export function kaynakAdi(k: KaynakSecimi): string | null {
  if (k.tur === 'test') return `${k.kitapAd} · ${k.testAd}`;
  if (k.tur === 'metin') return k.metin.trim() || null;
  return null;
}

// --- Analiz gorunumu -----------------------------------------------------------------------

export type BasariSinifi = 'iyi' | 'orta' | 'zayif' | 'yok';

/** Basari esikleri (yalniz gosterim rengi/metni): >= %80 iyi, >= %60 orta, altinda zayif. */
export function basariSinifi(basari: number | null): BasariSinifi {
  if (basari === null) return 'yok';
  if (basari >= 0.8) return 'iyi';
  if (basari >= 0.6) return 'orta';
  return 'zayif';
}

export const yuzdeMetni = (basari: number | null): string =>
  basari === null ? '-' : `%${String(Math.round(basari * 100))}`;

/** Hucre ozeti ("%90 · 20 soru"); bos hucre "Yok". Ekran okuyucu icin de ayni metin kullanilir. */
export function hucreMetni(h: Hucre): string {
  if (h.cozulen === 0) return t('mobil.gunluk.analiz.hucreYok');
  return t('mobil.gunluk.analiz.hucreOzet', { yuzde: yuzdeMetni(h.basari), soru: h.cozulen });
}

export function zorlukAdi(z: Zorluk | 'belirtilmemis'): string {
  return t(`gunlukSoru.zorluk.${z}`);
}

/** Bant tespitinin Turkce metni ("Orta seviyede zorlanıyor", "Veri az" ...). */
export function bantMetni(b: BantTespiti): string {
  if (b.durum === 'zorlaniyor' && b.bant) {
    return t('gunlukSoru.bant.zorlaniyor', { bant: zorlukAdi(b.bant) });
  }
  return b.durum === 'veri_az' ? t('gunlukSoru.bant.veriAz') : t('gunlukSoru.bant.tespitYok');
}

/** Konu satiri ekran okuyucu etiketi: "Üslü Sayılar: Kolay %90 · 20 soru, Orta ..., Orta seviyede zorlanıyor". */
export function konuEtiketi(k: KonuAnalizi): string {
  const parcalar = ZORLUKLAR.map((z) => `${zorlukAdi(z)} ${hucreMetni(k.hucreler[z])}`);
  if (k.hucreler.belirtilmemis.cozulen > 0) {
    parcalar.push(`${zorlukAdi('belirtilmemis')} ${hucreMetni(k.hucreler.belirtilmemis)}`);
  }
  return `${k.konuAd ?? t('mobil.gunluk.analiz.konuAdsiz')}: ${parcalar.join(', ')}. ${bantMetni(k.bant)}`;
}

/**
 * Konulari "once dikkat gerekenler": zorlanan bant (kolay > orta > zor), sonra dusuk basari, sonra
 * cok soru. Veri azlar sona yakin (basari bilinse bile tespit yok).
 */
export function konulariSirala(konular: readonly KonuAnalizi[]): KonuAnalizi[] {
  const dereceOf = (k: KonuAnalizi) =>
    k.bant.durum === 'zorlaniyor' ? 0 : k.bant.durum === 'tespit_yok' ? 1 : 2;
  return [...konular].sort(
    (a, b) =>
      dereceOf(a) - dereceOf(b) ||
      (a.toplam.basari ?? 1) - (b.toplam.basari ?? 1) ||
      b.toplam.cozulen - a.toplam.cozulen,
  );
}

export const VERI_AZ_ESIGI = BANT_EN_AZ_SORU;
