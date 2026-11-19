/**
 * "Duzenli calisan ogrenci" modeli: seviye egrisinin hedeflere uydugunu gostermek icin kullanilan
 * varsayimlar (docs/schema/motivasyon.md "Duzenli ogrenci varsayimlari"). XP degerleri `xp_kurallari`
 * tohumundadir; burada yalniz haftalik etkinlik sayilari vardir.
 */

export interface HaftalikVarsayim {
  /** Haftada ders (yoklama `geldi`) ve her biri icin geri bildirim. */
  ders: number;
  /** Haftada zamaninda teslim edilen ve ogretmenin onayladigi odev. */
  odev: number;
  /** Plan gorevi tamamlanan gun ve gunde gorev sayisi. */
  planGunu: number;
  gunlukPlanGorevi: number;
  /** Odak calisilan gun ve gunde dakika. */
  odakGunu: number;
  gunlukOdakDk: number;
  /** Soru sorulan gun (her biri: 1 soru + 1 "anladim"). */
  soruGunu: number;
  /** Gunluk soru kaydi girilen gun ve gunde kayit sayisi (her kayit en az 5 soru). */
  gunlukSoruGunu: number;
  gunlukKayit: number;
  /** Haftada izlenen ders kaydi. */
  kayit: number;
  /** Iki haftada bir deneme ve ortalama net artisi (net). */
  haftaBasinaDeneme: number;
  denemeBasinaNetArtisi: number;
}

export const DUZENLI_OGRENCI: HaftalikVarsayim = {
  ders: 3,
  odev: 2,
  planGunu: 5,
  gunlukPlanGorevi: 3,
  odakGunu: 5,
  gunlukOdakDk: 30,
  soruGunu: 4,
  gunlukSoruGunu: 5,
  gunlukKayit: 3,
  kayit: 2,
  haftaBasinaDeneme: 0.5,
  denemeBasinaNetArtisi: 2,
};

/** Tohum kural degerleri (migration ile ayni; test denetler). */
export interface KuralDegerleri {
  yoklama: number;
  geriBildirim: number;
  odevTeslim: number;
  odevOnay: number;
  planGorevi: number;
  planTavan: number;
  odakDk: number;
  odakTavan: number;
  soruSorma: number;
  soruAnladim: number;
  soruTavan: number;
  gunlukSoru: number;
  gunlukSoruTavan: number;
  kayit: number;
  kayitTavan: number;
  denemeGirisi: number;
  netBasina: number;
  denemeNetTavan: number;
  genelTavan: number;
}

export const TOHUM_KURALLAR: KuralDegerleri = {
  yoklama: 20,
  geriBildirim: 2,
  odevTeslim: 15,
  odevOnay: 10,
  planGorevi: 5,
  planTavan: 40,
  odakDk: 1,
  odakTavan: 120,
  soruSorma: 3,
  soruAnladim: 5,
  soruTavan: 20,
  gunlukSoru: 2,
  gunlukSoruTavan: 10,
  kayit: 5,
  kayitTavan: 15,
  denemeGirisi: 10,
  netBasina: 5,
  denemeNetTavan: 50,
  genelTavan: 300,
};

const enAz = (a: number, b: number) => Math.min(a, b);

/** Gunluk soru kaydindan gunluk XP: kayit basina sabit XP, `gunluk_soru` gunluk tavani. */
const gunlukSoruXp = (k: KuralDegerleri, v: HaftalikVarsayim) =>
  Math.min(v.gunlukKayit * k.gunlukSoru, k.gunlukSoruTavan);

/** Tipik ders gunu XP'si (ilk gun): yoklama + geri bildirim + plan + odak + 1 soru ve "anladim" + gunluk soru. */
export function ilkGunXp(k: KuralDegerleri = TOHUM_KURALLAR, v = DUZENLI_OGRENCI): number {
  const plan = enAz(v.gunlukPlanGorevi * k.planGorevi, k.planTavan);
  const odak = enAz(v.gunlukOdakDk * k.odakDk, k.odakTavan);
  const soru = enAz(k.soruSorma + k.soruAnladim, k.soruTavan);
  return enAz(k.yoklama + k.geriBildirim + plan + odak + soru + gunlukSoruXp(k, v), k.genelTavan);
}

/** Duzenli ogrencinin haftalik XP'si (gunluk tavanlar uygulanmis). */
export function haftalikXp(k: KuralDegerleri = TOHUM_KURALLAR, v = DUZENLI_OGRENCI): number {
  const dersler = v.ders * (k.yoklama + k.geriBildirim);
  const odevler = v.odev * (k.odevTeslim + k.odevOnay);
  const plan = v.planGunu * enAz(v.gunlukPlanGorevi * k.planGorevi, k.planTavan);
  const odak = v.odakGunu * enAz(v.gunlukOdakDk * k.odakDk, k.odakTavan);
  const soru = v.soruGunu * enAz(k.soruSorma + k.soruAnladim, k.soruTavan);
  const gunlukSoru = v.gunlukSoruGunu * gunlukSoruXp(k, v);
  const kayit = enAz(v.kayit * k.kayit, k.kayitTavan * 7);
  const net = enAz(v.denemeBasinaNetArtisi * k.netBasina, k.denemeNetTavan);
  const deneme = v.haftaBasinaDeneme * (k.denemeGirisi + net);
  return dersler + odevler + plan + odak + soru + gunlukSoru + kayit + deneme;
}
