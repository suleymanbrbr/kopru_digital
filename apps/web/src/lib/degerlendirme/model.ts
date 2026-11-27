import type { Degerlendirme, KaynakOnerisi } from '@kopru/contracts';
import { t } from '@kopru/i18n';

import { haftaBasi, tarihEkle } from '@/lib/saat';

/** Dort ölçek: API alan adları ve `degerlendirme.olcek.*` metin anahtarları aynıdır. */
export const OLCEKLER = [
  'calisma_duzeni',
  'derse_katilim',
  'odev_disiplini',
  'anlama_duzeyi',
] as const;
export type OlcekAdi = (typeof OLCEKLER)[number];

export const OLCEK_PUANLARI = [1, 2, 3, 4, 5] as const;

/** API ile ayni sinirlar. */
export const EN_FAZLA_DONEM_GUN = 31;

export type DonemTuru = 'hafta' | 'gun' | 'aralik';

/** "Bu hafta" donemi: Pazartesi..Pazar (bugun hangi gun olursa olsun). */
export function buHafta(bugun: string): { baslangic: string; bitis: string } {
  const baslangic = haftaBasi(bugun);
  return { baslangic, bitis: tarihEkle(baslangic, 6) };
}

const kisa = (tarih: string) =>
  new Intl.DateTimeFormat('tr-TR', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(
    new Date(`${tarih}T00:00:00Z`),
  );

/** `2026-11-23`..`2026-11-29` -> "23 Kas – 29 Kas"; tek gun -> "23 Kas". */
export function donemEtiketi(baslangic: string, bitis: string): string {
  return baslangic === bitis ? kisa(baslangic) : `${kisa(baslangic)} – ${kisa(bitis)}`;
}

/** Mevcut bir degerlendirmenin donem turu (duzenleme penceresi on secimi). */
export function donemTuru(
  d: Pick<Degerlendirme, 'donem_baslangic' | 'donem_bitis'>,
  bugun: string,
) {
  if (d.donem_baslangic === d.donem_bitis) return 'gun' as const;
  const h = buHafta(bugun);
  return d.donem_baslangic === h.baslangic && d.donem_bitis === h.bitis
    ? ('hafta' as const)
    : ('aralik' as const);
}

export interface DonemGirdisi {
  tur: DonemTuru;
  gun: string;
  bugun: string;
  /** `aralik` turunde (duzenleme) korunan tarihler. */
  aralik?: { baslangic: string; bitis: string };
}

export type DonemSonucu =
  { tamam: true; baslangic: string; bitis: string } | { tamam: false; hata: 'gun' | 'aralik' };

/** Formdaki donem secimini API tarihlerine cevirir; "gelecek gun" ve 31 gun siniri denetlenir. */
export function donemCoz({ tur, gun, bugun, aralik }: DonemGirdisi): DonemSonucu {
  if (tur === 'hafta') {
    const h = buHafta(bugun);
    return { tamam: true, ...h };
  }
  if (tur === 'gun') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(gun) || gun > bugun) return { tamam: false, hata: 'gun' };
    return { tamam: true, baslangic: gun, bitis: gun };
  }
  const a = aralik;
  if (!a) return { tamam: false, hata: 'aralik' };
  const gunSayisi = (Date.parse(a.bitis) - Date.parse(a.baslangic)) / 86_400_000 + 1;
  if (a.bitis < a.baslangic || gunSayisi > EN_FAZLA_DONEM_GUN || a.baslangic > bugun) {
    return { tamam: false, hata: 'aralik' };
  }
  return { tamam: true, ...a };
}

/** Ondalik ortalama Turkce gosterim ("3,5"); veri yoksa `-`. */
export function ortalamaYaz(n: number | null): string {
  if (n === null) return '-';
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(n);
}

/** 1-5 ortalamayi 0-100 doluluk yuzdesine cevirir (cubuk genisligi). */
export function olcekYuzdesi(n: number | null): number {
  if (n === null) return 0;
  return Math.max(0, Math.min(100, Math.round((n / 5) * 100)));
}

/** Onerinin gorunen adi: kitap, kitap + test ya da baslik. */
export function oneriBasligi(
  o: Pick<KaynakOnerisi, 'tur' | 'kaynak_kitap_ad' | 'kaynak_test_ad' | 'baslik'>,
): string {
  if (o.tur === 'kaynak_kitap') return o.kaynak_kitap_ad ?? '';
  if (o.tur === 'kaynak_kitap_testi') {
    return [o.kaynak_kitap_ad, o.kaynak_test_ad].filter((x) => x).join(' · ');
  }
  return o.baslik ?? '';
}

/** Yalniz http/https adresler acilabilir (api de ayni kurali uygular); degilse `null`. */
export function guvenliBaglanti(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname !== '' ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * Ogrencinin "Soru cozdum" formunu oneriyle on secmek icin sorgu dizgesi:
 * kitap/test oneride kitap (+ test), serbest oneride metin; ders ve konu varsa onlar da.
 * `link` onerisi kayitta kaynak olamaz: `null`.
 */
export function oneridenKayitSorgusu(
  o: Pick<
    KaynakOnerisi,
    'tur' | 'kaynak_kitap_id' | 'kaynak_test_id' | 'baslik' | 'brans_kodu' | 'konu_id'
  >,
): string | null {
  const p = new URLSearchParams();
  if (o.tur === 'kaynak_kitap' || o.tur === 'kaynak_kitap_testi') {
    if (!o.kaynak_kitap_id) return null;
    p.set('kitap', o.kaynak_kitap_id);
    if (o.tur === 'kaynak_kitap_testi' && o.kaynak_test_id) p.set('test', o.kaynak_test_id);
  } else if (o.tur === 'serbest') {
    if (!o.baslik) return null;
    p.set('metin', o.baslik);
  } else {
    return null;
  }
  if (o.brans_kodu) p.set('brans', o.brans_kodu);
  if (o.konu_id) p.set('konu', o.konu_id);
  return p.toString();
}

/** Ogrenci kartindan yazma penceresini acan Bugun baglantisi. */
export function koclukYolu(kurumId: string, ogrenciId: string, yaz = false): string {
  return `/${kurumId}/ogrenciler/${ogrenciId}?sekme=kocluk${yaz ? '&yaz=1' : ''}`;
}

export function olcekAdi(olcek: OlcekAdi): string {
  return t(`degerlendirme.olcek.${olcek}`);
}
