import { PLAN_KILIT_GUN } from '@kopru/contracts';

import { bugunYerel, tarihEkle } from '../ders/index.js';

/**
 * Haftalik plan takvimi. Hafta Pazartesi baslar; hafta ve gun HER ZAMAN sunucuda `Europe/Istanbul`
 * yerel takvimiyle hesaplanir (istemci saatine guvenilmez). "Bugun" `ders` modulundeki `bugunYerel` ile
 * ayni yontemle (`Intl.DateTimeFormat`) cozulur; boylece saat dilimi veritabani kurallarina uyar.
 */
export const PLAN_SAAT_DILIMI = 'Europe/Istanbul';

const TARIH_DESENI = /^(\d{4})-(\d{2})-(\d{2})$/;
const GUN_MS = 86_400_000;

/** Istanbul takvimine gore bugun (`YYYY-MM-DD`). `simdi` testler icindir. */
export const planBugunu = (simdi: Date = new Date()): string => bugunYerel(PLAN_SAAT_DILIMI, simdi);

function utcMs(tarih: string): number {
  const t = TARIH_DESENI.exec(tarih);
  if (!t) throw new Error(`Geçersiz tarih: ${tarih}`);
  return Date.UTC(Number(t[1]), Number(t[2]) - 1, Number(t[3]));
}

/** 0 = Pazartesi ... 6 = Pazar. */
export const haftaninGunu = (tarih: string): number => (new Date(utcMs(tarih)).getUTCDay() + 6) % 7;

export const pazartesiMi = (tarih: string): boolean => haftaninGunu(tarih) === 0;

/** Tarihin ait oldugu haftanin Pazartesi gunu. */
export const haftaBaslangici = (tarih: string): string => tarihEkle(tarih, -haftaninGunu(tarih));

/** `b - a` gun sayisi (takvim gunu). */
export const gunFarki = (a: string, b: string): number =>
  Math.round((utcMs(b) - utcMs(a)) / GUN_MS);

/**
 * Hafta kilitli mi: haftanin sonundan (Pazar) itibaren `PLAN_KILIT_GUN` gun gectiyse. Pazar `+6`
 * oldugundan son yazilabilir gun `hafta + 6 + 14`'tur; ondan sonraki gun kilitlidir.
 */
export const haftaKilitliMi = (haftaBaslangic: string, bugun: string = planBugunu()): boolean =>
  bugun > tarihEkle(haftaBaslangic, 6 + PLAN_KILIT_GUN);

export { tarihEkle };
