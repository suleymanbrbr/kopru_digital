import {
  BILDIRIM_KANALLARI,
  BILDIRIM_KATEGORILERI,
  type BildirimAyarlari,
  type BildirimKanal,
  type BildirimKategori,
} from '@kopru/contracts';
import { sql } from 'drizzle-orm';

import { VARSAYILAN_SAAT_DILIMI, type Islem } from './ortak.js';

/**
 * Tercih ve sessiz saat kurallari (docs/schema/bildirim.md "Sozluk", "kullanici_ayarlari").
 * Burasi saf mantiktir (veritabani okuma yardimcilari en altta); uretim hatti ve API ayni kurallari kullanir.
 */

// --- Kanal matrisi ---------------------------------------------------------------------------

/** Kayit yoksa uygulanan varsayilan kanal matrisi. */
export function varsayilanAcik(kategori: BildirimKategori, kanal: BildirimKanal): boolean {
  if (kategori === 'sistem') return true; // zorunlu: tum kanallar acik, kapatilamaz
  if (kanal === 'kutu' || kanal === 'push') return true;
  if (kanal === 'eposta') return kategori === 'abonelik';
  return false; // sms
}

/** Degistirilemez hucre: `sistem` kategorisi ve `kutu` kanali. */
export function kilitliMi(kategori: BildirimKategori, kanal: BildirimKanal): boolean {
  return kategori === 'sistem' || kanal === 'kutu';
}

export type TercihHaritasi = ReadonlyMap<string, boolean>;

const anahtar = (kategori: string, kanal: string) => `${kategori}|${kanal}`;

/** Kullanicinin kaydettigi tercihleri okur (yalniz kayitli hucreler). */
export async function tercihleriOku(
  tx: Islem,
  kullaniciId: string,
  kurumId: string,
): Promise<TercihHaritasi> {
  const satirlar = await tx.execute<{ kategori: string; kanal: string; acik: boolean }>(sql`
    select kategori, kanal, acik from bildirim.tercihler
     where kullanici_id = ${kullaniciId} and kurum_id = ${kurumId}`);
  return new Map(satirlar.map((s) => [anahtar(s.kategori, s.kanal), s.acik]));
}

/** Kanal bu kullanici icin acik mi? Kilitli hucreler daima varsayilandir. */
export function kanalAcikMi(
  kayitli: TercihHaritasi,
  kategori: BildirimKategori,
  kanal: BildirimKanal,
): boolean {
  if (kilitliMi(kategori, kanal)) return varsayilanAcik(kategori, kanal);
  return kayitli.get(anahtar(kategori, kanal)) ?? varsayilanAcik(kategori, kanal);
}

/** Tum kategori x kanal matrisi (varsayilanlar uygulanmis, kilitli isaretli). */
export function tercihMatrisi(kayitli: TercihHaritasi) {
  return BILDIRIM_KATEGORILERI.flatMap((kategori) =>
    BILDIRIM_KANALLARI.map((kanal) => ({
      kategori,
      kanal,
      acik: kanalAcikMi(kayitli, kategori, kanal),
      kilitli: kilitliMi(kategori, kanal),
    })),
  );
}

// --- Ayarlar ---------------------------------------------------------------------------------

export const VARSAYILAN_AYARLAR: BildirimAyarlari = {
  sessiz_baslangic: '22:00',
  sessiz_bitis: '08:00',
  sessiz_gunler: [1, 2, 3, 4, 5, 6, 7],
  saat_dilimi: VARSAYILAN_SAAT_DILIMI,
  ders_hatirlatma_dk: 60,
};

const hhmm = (deger: string | null): string | null => (deger ? deger.slice(0, 5) : null);

/** Kayit yoksa ya da sessiz saat alanlari bossa varsayilanlar uygulanir. */
export async function ayarlariOku(
  tx: Islem,
  kullaniciId: string,
  kurumId: string,
): Promise<BildirimAyarlari> {
  const [a] = await tx.execute<{
    sessiz_baslangic: string | null;
    sessiz_bitis: string | null;
    sessiz_gunler: number[];
    saat_dilimi: string;
    ders_hatirlatma_dk: number;
  }>(sql`
    select sessiz_baslangic::text as sessiz_baslangic, sessiz_bitis::text as sessiz_bitis,
           sessiz_gunler::int[] as sessiz_gunler, saat_dilimi, ders_hatirlatma_dk::int as ders_hatirlatma_dk
      from bildirim.kullanici_ayarlari
     where kullanici_id = ${kullaniciId} and kurum_id = ${kurumId}`);
  if (!a) return { ...VARSAYILAN_AYARLAR, sessiz_gunler: [...VARSAYILAN_AYARLAR.sessiz_gunler] };
  return {
    sessiz_baslangic: hhmm(a.sessiz_baslangic) ?? VARSAYILAN_AYARLAR.sessiz_baslangic,
    sessiz_bitis: hhmm(a.sessiz_bitis) ?? VARSAYILAN_AYARLAR.sessiz_bitis,
    sessiz_gunler: [...a.sessiz_gunler].sort((x, y) => x - y),
    saat_dilimi: a.saat_dilimi,
    ders_hatirlatma_dk: a.ders_hatirlatma_dk as BildirimAyarlari['ders_hatirlatma_dk'],
  };
}

// --- Saat dilimi ve sessiz saat --------------------------------------------------------------

interface YerelParcalar {
  yil: number;
  ay: number;
  gun: number;
  saat: number;
  dakika: number;
  /** ISO gun numarasi: 1 Pazartesi ... 7 Pazar. */
  haftaGunu: number;
}

const HAFTA_GUNLERI: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export function yerelParcalar(an: Date, saatDilimi: string): YerelParcalar {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: saatDilimi,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(an);
  const al = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return {
    yil: Number(al('year')),
    ay: Number(al('month')),
    gun: Number(al('day')),
    saat: Number(al('hour')) % 24,
    dakika: Number(al('minute')),
    haftaGunu: HAFTA_GUNLERI[al('weekday')] ?? 1,
  };
}

/** Verilen anda dilimin UTC farki (dakika; dogu pozitif). */
function dilimFarki(an: Date, saatDilimi: string): number {
  const y = yerelParcalar(an, saatDilimi);
  const yerelUtc = Date.UTC(y.yil, y.ay - 1, y.gun, y.saat, y.dakika);
  return Math.round((yerelUtc - Math.floor(an.getTime() / 60_000) * 60_000) / 60_000);
}

/** Yerel duvar saatini (gun, saat, dakika) UTC ana cevirir; gun tasmalari (`gun` > ay sonu) kabul edilir. */
export function yerelden(
  yil: number,
  ay: number,
  gun: number,
  dakikaGun: number,
  saatDilimi: string,
): Date {
  const tahmin = Date.UTC(yil, ay - 1, gun, 0, dakikaGun);
  const ilk = tahmin - dilimFarki(new Date(tahmin), saatDilimi) * 60_000;
  return new Date(tahmin - dilimFarki(new Date(ilk), saatDilimi) * 60_000);
}

const dakikaOlarak = (hhmmDegeri: string): number => {
  const [s = '0', d = '0'] = hhmmDegeri.split(':');
  return Number(s) * 60 + Number(d);
};

export type SessizSaatKarari = { sessiz: false } | { sessiz: true; bitisAt: Date };

/**
 * Anin sessiz araliga denk gelip gelmedigini ve (geliyorsa) aralik bitisini hesaplar.
 *
 * - Baslangic = bitis ya da `sessiz_gunler` bos: sessiz saat kapali.
 * - Gun kurali: `sessiz_gunler`, sessiz araligin BASLADIGI gunu belirtir. Gece yarisini asan aralikta
 *   (22:00-08:00) saat 03:00'te baslangic gunu DUN'dur.
 */
export function sessizSaatKarari(
  an: Date,
  ayar: Pick<
    BildirimAyarlari,
    'sessiz_baslangic' | 'sessiz_bitis' | 'sessiz_gunler' | 'saat_dilimi'
  >,
): SessizSaatKarari {
  const baslangic = dakikaOlarak(ayar.sessiz_baslangic);
  const bitis = dakikaOlarak(ayar.sessiz_bitis);
  if (baslangic === bitis || ayar.sessiz_gunler.length === 0) return { sessiz: false };
  const y = yerelParcalar(an, ayar.saat_dilimi);
  const simdi = y.saat * 60 + y.dakika;
  const oncekiGun = y.haftaGunu === 1 ? 7 : y.haftaGunu - 1;

  let baslangicGunu: number;
  let bitisGunOffset: number; // bitis, yerel bugune gore kac gun sonra
  if (baslangic < bitis) {
    if (simdi < baslangic || simdi >= bitis) return { sessiz: false };
    baslangicGunu = y.haftaGunu;
    bitisGunOffset = 0;
  } else if (simdi >= baslangic) {
    baslangicGunu = y.haftaGunu;
    bitisGunOffset = 1;
  } else if (simdi < bitis) {
    baslangicGunu = oncekiGun;
    bitisGunOffset = 0;
  } else {
    return { sessiz: false };
  }
  if (!ayar.sessiz_gunler.includes(baslangicGunu)) return { sessiz: false };
  return {
    sessiz: true,
    bitisAt: yerelden(y.yil, y.ay, y.gun + bitisGunOffset, bitis, ayar.saat_dilimi),
  };
}
