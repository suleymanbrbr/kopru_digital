import { t, type MessageKey } from '@kopru/i18n';

import {
  DONEM_EN_FAZLA_GUN,
  NOT_EN_FAZLA,
  OLCEK_KODLARI,
  YORUM_EN_FAZLA,
  type Degerlendirme,
  type KaynakOneriGirdisi,
  type KaynakOnerisi,
  type OlcekKodu,
  type Olcekler,
} from '../api/degerlendirmeTipleri';
import { tarihEkle } from '../lib/saat';
import { haftaBaslangici } from '../ogrenme/hafta';

// --- Donem -----------------------------------------------------------------------------------

const AYLAR_KISA = [
  'Oca',
  'Şub',
  'Mar',
  'Nis',
  'May',
  'Haz',
  'Tem',
  'Ağu',
  'Eyl',
  'Eki',
  'Kas',
  'Ara',
] as const;

/** "2026-11-23" -> "23 Kas" (takvim gunu oldugu gibi; cihaz saat dilimine bagli degil). */
export function kisaTarih(tarih: string): string {
  const ay = AYLAR_KISA[Number(tarih.slice(5, 7)) - 1] ?? '';
  return `${String(Number(tarih.slice(8, 10)))} ${ay}`;
}

/** "23 Kas – 29 Kas"; tek gun "23 Kas". */
export function donemEtiketi(baslangic: string, bitis: string): string {
  return baslangic === bitis
    ? kisaTarih(baslangic)
    : `${kisaTarih(baslangic)} – ${kisaTarih(bitis)}`;
}

/**
 * Form donem secenekleri: hafta (Pazartesi..Pazar), gecen hafta, bugun, dun. Duzenlemede mevcut
 * donem bunlardan biri degilse `ozel` (tarihler aynen korunur).
 */
export type DonemSecimi = 'hafta' | 'gecen_hafta' | 'bugun' | 'dun' | 'ozel';
export const DONEM_SECENEKLERI: readonly Exclude<DonemSecimi, 'ozel'>[] = [
  'hafta',
  'gecen_hafta',
  'bugun',
  'dun',
];

export interface Donem {
  baslangic: string;
  bitis: string;
}

/** Secimi api tarihlerine cevirir. Hafta donemi bugun hangi gun olursa olsun Pazartesi..Pazar'dir. */
export function donemCoz(secim: Exclude<DonemSecimi, 'ozel'>, bugun: string): Donem {
  const hafta = haftaBaslangici(bugun);
  switch (secim) {
    case 'hafta':
      return { baslangic: hafta, bitis: tarihEkle(hafta, 6) };
    case 'gecen_hafta':
      return { baslangic: tarihEkle(hafta, -7), bitis: tarihEkle(hafta, -1) };
    case 'bugun':
      return { baslangic: bugun, bitis: bugun };
    case 'dun':
      return { baslangic: tarihEkle(bugun, -1), bitis: tarihEkle(bugun, -1) };
  }
}

/** Mevcut bir donemin hangi secenege denk geldigi (duzenleme on secimi). */
export function donemSecimiBul(d: Donem, bugun: string): DonemSecimi {
  for (const s of DONEM_SECENEKLERI) {
    const c = donemCoz(s, bugun);
    if (c.baslangic === d.baslangic && c.bitis === d.bitis) return s;
  }
  return 'ozel';
}

/** Api ile ayni donem kurali (yerel on kontrol; asil karar sunucudadir). */
export function donemGecerliMi(d: Donem, bugun: string): boolean {
  const gun = (Date.parse(d.bitis) - Date.parse(d.baslangic)) / 86_400_000 + 1;
  return d.baslangic <= bugun && d.bitis >= d.baslangic && gun <= DONEM_EN_FAZLA_GUN;
}

// --- Degerlendirme formu ---------------------------------------------------------------------

export interface DegerlendirmeFormHatasi {
  /** Ne yorum ne de olcek dolu. */
  bos?: true;
  yorumUzun?: true;
}

export function degerlendirmeFormuDogrula(f: {
  olcekler: Partial<Olcekler>;
  yorum: string;
}): DegerlendirmeFormHatasi {
  const hata: DegerlendirmeFormHatasi = {};
  const yorum = f.yorum.trim();
  const olcekVar = OLCEK_KODLARI.some((k) => typeof f.olcekler[k] === 'number');
  if (!yorum && !olcekVar) hata.bos = true;
  if (yorum.length > YORUM_EN_FAZLA) hata.yorumUzun = true;
  return hata;
}

export const olcekAdi = (k: OlcekKodu): string => t(`degerlendirme.olcek.${k}` as MessageKey);

/** 1-5 ortalama ya da puan: "3,5"; veri yoksa "-". */
export function puanMetni(n: number | null): string {
  if (n === null) return '-';
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

/** "Calisma duzeni 4/5" ya da "belirtilmedi": ekran okuyucu icin de ayni metin. */
export function olcekSatiri(k: OlcekKodu, puan: number | null): string {
  return puan === null
    ? t('mobil.degerlendirme.olcekBelirtilmedi', { olcek: olcekAdi(k) })
    : t('mobil.degerlendirme.olcekPuan', { olcek: olcekAdi(k), puan });
}

/** Yalniz dolu olcekler (okunakli liste). */
export function doluOlcekler(o: Olcekler): { kod: OlcekKodu; puan: number }[] {
  return OLCEK_KODLARI.flatMap((kod) => {
    const puan = o[kod];
    return typeof puan === 'number' ? [{ kod, puan }] : [];
  });
}

/** Yazarin gorunen adi: silinmis hesapta "Eski ogretmen"; kendisi ise "(sen)". */
export function yazarAdi(d: Pick<Degerlendirme, 'yazarAd' | 'benim'>): string {
  const yazar = d.yazarAd?.trim() ?? '';
  const ad = yazar === '' ? t('mobil.degerlendirme.eskiOgretmen') : yazar;
  return d.benim ? t('mobil.degerlendirme.yazarSen', { ad }) : ad;
}

// --- Kaynak onerisi --------------------------------------------------------------------------

/** Onerinin gorunen adi: kitap, kitap + test ya da baslik. */
export function oneriBasligi(
  o: Pick<KaynakOnerisi, 'tur' | 'kaynakKitapAd' | 'kaynakTestAd' | 'baslik'>,
): string {
  if (o.tur === 'kaynak_kitap') return o.kaynakKitapAd ?? '';
  if (o.tur === 'kaynak_kitap_testi') {
    return [o.kaynakKitapAd, o.kaynakTestAd].filter((x) => x).join(' · ');
  }
  return o.baslik ?? '';
}

/** Yalniz http/https adresler acilabilir (api de ayni kurali uygular); degilse `null`. */
export function guvenliBaglanti(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname !== '' ? u.href : null;
  } catch {
    return null;
  }
}

export interface OneriFormHatasi {
  kitap?: true;
  test?: true;
  baglanti?: true;
  baslik?: true;
  ders?: true;
  notUzun?: true;
}

export interface OneriFormDegeri {
  tur: KaynakOneriGirdisi['tur'];
  kitapId: string | null;
  testId: string | null;
  baglanti: string;
  baslik: string;
  bransKodu: string | null;
  konuId: string | null;
  notMetni: string;
}

export function oneriFormuDogrula(f: OneriFormDegeri): OneriFormHatasi {
  const h: OneriFormHatasi = {};
  if (f.tur === 'kaynak_kitap' && !f.kitapId) h.kitap = true;
  if (f.tur === 'kaynak_kitap_testi' && !f.testId) h.test = true;
  if (f.tur === 'link') {
    if (!guvenliBaglanti(f.baglanti)) h.baglanti = true;
    if (!f.baslik.trim()) h.baslik = true;
  }
  if (f.tur === 'serbest' && !f.baslik.trim()) h.baslik = true;
  // Link/serbestte konu yalniz ders ile birlikte anlamlidir (api `brans_kodu` ister).
  if ((f.tur === 'link' || f.tur === 'serbest') && f.konuId && !f.bransKodu) h.ders = true;
  if (f.notMetni.trim().length > NOT_EN_FAZLA) h.notUzun = true;
  return h;
}

/** Gecerli formu api girdisine cevirir (once `oneriFormuDogrula` bos donmeli). */
export function oneriGirdisi(f: OneriFormDegeri): KaynakOneriGirdisi | null {
  const ortak = {
    ...(f.konuId ? { konuId: f.konuId } : {}),
    ...(f.notMetni.trim() ? { notMetni: f.notMetni.trim() } : {}),
  };
  switch (f.tur) {
    case 'kaynak_kitap':
      return f.kitapId ? { tur: 'kaynak_kitap', kitapId: f.kitapId, ...ortak } : null;
    case 'kaynak_kitap_testi':
      return f.testId ? { tur: 'kaynak_kitap_testi', testId: f.testId, ...ortak } : null;
    case 'link': {
      const url = guvenliBaglanti(f.baglanti);
      return url
        ? {
            tur: 'link',
            baglantiUrl: url,
            baslik: f.baslik.trim(),
            ...(f.bransKodu ? { bransKodu: f.bransKodu } : {}),
            ...ortak,
          }
        : null;
    }
    case 'serbest':
      return {
        tur: 'serbest',
        baslik: f.baslik.trim(),
        ...(f.bransKodu ? { bransKodu: f.bransKodu } : {}),
        ...ortak,
      };
  }
}

/**
 * Ogrencinin "Soru cozdum" formunu oneriyle on secmek icin rota parametreleri: kitap/test oneride
 * kitap (+ test), serbest oneride metin; ders ve konu varsa onlar da. `link` onerisi kayitta kaynak
 * olamaz: `null`.
 */
export function oneridenFormParametreleri(
  o: Pick<
    KaynakOnerisi,
    | 'tur'
    | 'kaynakKitapId'
    | 'kaynakKitapAd'
    | 'kaynakTestId'
    | 'kaynakTestAd'
    | 'baslik'
    | 'bransKodu'
    | 'konuId'
  >,
): Record<string, string> | null {
  const p: Record<string, string> = {};
  if (o.tur === 'kaynak_kitap' || o.tur === 'kaynak_kitap_testi') {
    if (!o.kaynakKitapId) return null;
    p.kaynakKitapId = o.kaynakKitapId;
    if (o.kaynakKitapAd) p.kaynakKitapAd = o.kaynakKitapAd;
    if (o.tur === 'kaynak_kitap_testi' && o.kaynakTestId) {
      p.kaynakTestId = o.kaynakTestId;
      if (o.kaynakTestAd) p.kaynakTestAd = o.kaynakTestAd;
    }
  } else if (o.tur === 'serbest') {
    if (!o.baslik) return null;
    p.kaynakMetin = o.baslik;
  } else {
    return null;
  }
  if (o.bransKodu) p.bransKodu = o.bransKodu;
  if (o.konuId) p.konuId = o.konuId;
  return p;
}

/** "Basladi" durumunun metni ve anlami (renk tek sinyal degildir: ikon + metin birlikte). */
export function basladiDurumu(basladi: boolean | null): {
  anahtar: 'basladi' | 'baslamadi' | 'olculemez';
  metin: string;
} {
  if (basladi === true) return { anahtar: 'basladi', metin: t('kaynakOnerisi.basladi') };
  if (basladi === false) return { anahtar: 'baslamadi', metin: t('kaynakOnerisi.baslamadi') };
  return { anahtar: 'olculemez', metin: t('kaynakOnerisi.olculemez') };
}
