import type {
  DersRaporOzetSema,
  HesapRaporOzetSema,
  OgrenmeRaporOzetSema,
  RaporOrani,
} from '@kopru/contracts';
import { t } from '@kopru/i18n';
import type { z } from 'zod';

type Hesap = z.infer<typeof HesapRaporOzetSema>;
type Ders = z.infer<typeof DersRaporOzetSema>;
type Ogrenme = z.infer<typeof OgrenmeRaporOzetSema>;

type DersGosterge = Ders['kurum'];
type OgrenmeGosterge = Omit<Ogrenme['kurum'], 'etkin_ogrenci'>;
type Soru = OgrenmeGosterge['soru'];

/**
 * Paneldeki bir satirin gostergeleri. `undefined` = o modulun yaniti henuz yok ya da yuklenemedi;
 * `null` = modul kurumda kapali.
 */
export interface GostergeSatiri {
  devam: RaporOrani | null | undefined;
  anladim: RaporOrani | null | undefined;
  odev: RaporOrani | null | undefined;
  plan: RaporOrani | null | undefined;
  soru: Soru | undefined;
}

export interface GrupSatiri extends GostergeSatiri {
  id: string;
  ad: string;
  tur: string;
  aktifOgrenci: number;
  etkinOgrenci: number | undefined;
}

export interface OgretmenSatiri extends GostergeSatiri {
  id: string;
  ad: string | null;
  grupSayisi: number;
  aktifOgrenci: number;
}

const BOS_ORAN: RaporOrani = { pay: 0, payda: 0, oran: null };
const BOS_SORU = {
  soru_sayisi: 0,
  cevaplanan: 0,
  ortalama_ilk_cevap_sn: null,
  medyan_ilk_cevap_sn: null,
};

/**
 * Bir satirin gostergeleri: modul yaniti geldiyse ama bu satirda veri yoksa (o donemde hic kayit
 * yok) "0 / 0" olur; modul kurumda kapaliysa `null`; yanit hic gelmediyse `undefined`.
 */
function satir(
  ders: Ders | undefined,
  ogrenme: Ogrenme | undefined,
  d: DersGosterge | undefined,
  o: OgrenmeGosterge | undefined,
): GostergeSatiri {
  const dersOran = (anahtar: 'devam' | 'anladim') =>
    ders ? (d?.[anahtar] ?? (ders.kurum[anahtar] === null ? null : BOS_ORAN)) : undefined;
  const ogrenmeOran = (anahtar: 'odev' | 'plan') =>
    ogrenme ? (o?.[anahtar] ?? (ogrenme.kurum[anahtar] === null ? null : BOS_ORAN)) : undefined;
  return {
    devam: dersOran('devam'),
    anladim: dersOran('anladim'),
    odev: ogrenmeOran('odev'),
    plan: ogrenmeOran('plan'),
    soru: ogrenme ? (o?.soru ?? (ogrenme.kurum.soru === null ? null : BOS_SORU)) : undefined,
  };
}

/**
 * Uc modulun (hesap: dizin, ders, ogrenme) yanitini panel satirlarina birlestirir. Satir iskeleti
 * hesap yanitindan gelir; ders/ogrenme yaniti gelmediyse gostergeler `undefined` kalir.
 */
export function satirlariBirlestir(hesap: Hesap, ders?: Ders, ogrenme?: Ogrenme) {
  const dersGrup = new Map(ders?.gruplar.map((g) => [g.grup_id, g]));
  const ogrGrup = new Map(ogrenme?.gruplar.map((g) => [g.grup_id, g]));
  const dersOgr = new Map(ders?.ogretmenler.map((o) => [o.ogretmen_id, o]));
  const ogrOgr = new Map(ogrenme?.ogretmenler.map((o) => [o.ogretmen_id, o]));
  const gruplar: GrupSatiri[] = hesap.gruplar.map((g) => ({
    id: g.grup_id,
    ad: g.ad,
    tur: g.tur,
    aktifOgrenci: g.aktif_ogrenci,
    etkinOgrenci: ogrenme ? (ogrGrup.get(g.grup_id)?.etkin_ogrenci ?? 0) : undefined,
    ...satir(ders, ogrenme, dersGrup.get(g.grup_id), ogrGrup.get(g.grup_id)),
  }));
  const ogretmenler: OgretmenSatiri[] = hesap.ogretmenler.map((o) => ({
    id: o.ogretmen_id,
    ad: o.gorunen_ad,
    grupSayisi: o.grup_sayisi,
    aktifOgrenci: o.aktif_ogrenci,
    ...satir(ders, ogrenme, dersOgr.get(o.ogretmen_id), ogrOgr.get(o.ogretmen_id)),
  }));
  return {
    gruplar,
    ogretmenler,
    kurum: {
      devam: ders?.kurum.devam,
      anladim: ders?.kurum.anladim,
      odev: ogrenme?.kurum.odev,
      plan: ogrenme?.kurum.plan,
      soru: ogrenme?.kurum.soru,
    } satisfies GostergeSatiri,
    etkinOgrenci: ogrenme?.kurum.etkin_ogrenci,
  };
}

/** 0-1 orani `%85` metnine cevirir; veri yoksa uzun tire. */
export function yuzdeYaz(oran: number | null | undefined): string {
  return oran === null || oran === undefined ? '—' : `%${String(Math.round(oran * 100))}`;
}

/** Saniyeyi "45 sn", "21 dk", "1 sa 5 dk" olarak yazar; veri yoksa uzun tire. */
export function sureYaz(sn: number | null | undefined): string {
  if (sn === null || sn === undefined) return '—';
  if (sn < 60) return t('rapor.sure.sn', { n: sn });
  const dk = Math.round(sn / 60);
  if (dk < 60) return t('rapor.sure.dk', { n: dk });
  return t('rapor.sure.saat', { s: Math.floor(dk / 60), dk: dk % 60 });
}
