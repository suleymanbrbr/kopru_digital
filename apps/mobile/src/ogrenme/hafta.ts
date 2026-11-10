import type { PlanGorevDurumu, PlanGorevi } from '../api/ogrenmeTipleri';
import { gunBasligi, haftaninGunu, tarihEkle, type GunKodu } from '../lib/saat';

/**
 * Hafta ve gun islemleri. Tum tarihler kurum yerel gunudur (`YYYY-MM-DD`); "bugun" hesabi
 * cagiranin `bugunTarihi(tz)` ile verdigi degerdir, cihaz saat dilimine guvenilmez.
 * Hafta Pazartesi'de baslar, Pazar'da biter.
 */

const PAZARTESIDEN: Record<GunKodu, number> = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };

/** Tarihin haftasinin Pazartesi gunu. */
export function haftaBaslangici(tarih: string): string {
  return tarihEkle(tarih, -PAZARTESIDEN[haftaninGunu(tarih)]);
}

/** Haftanin 7 gunu (Pazartesi -> Pazar). */
export function haftaGunleri(tarih: string): string[] {
  const bas = haftaBaslangici(tarih);
  return Array.from({ length: 7 }, (_, i) => tarihEkle(bas, i));
}

/** `n` hafta sonrasinin (negatifse oncesinin) Pazartesi gunu. */
export function haftaKaydir(tarih: string, n: number): string {
  return tarihEkle(haftaBaslangici(tarih), n * 7);
}

const AYLAR = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
] as const;

function ayGun(tarih: string): { gun: number; ay: string } {
  return { gun: Number(tarih.slice(8, 10)), ay: AYLAR[Number(tarih.slice(5, 7)) - 1] ?? '' };
}

/** "9 – 15 Kasım" ya da ay degisiyorsa "26 Ekim – 1 Kasım". */
export function haftaEtiketi(tarih: string): string {
  const bas = ayGun(haftaBaslangici(tarih));
  const son = ayGun(tarihEkle(haftaBaslangici(tarih), 6));
  return bas.ay === son.ay
    ? `${String(bas.gun)} – ${String(son.gun)} ${son.ay}`
    : `${String(bas.gun)} ${bas.ay} – ${String(son.gun)} ${son.ay}`;
}

export { gunBasligi };

/** "9 Kasım 2026": takvim gunu oldugu gibi (cihaz saat dilimine bagli degil). */
export function tarihMetni(tarih: string): string {
  const { gun, ay } = ayGun(tarih);
  return `${String(gun)} ${ay} ${tarih.slice(0, 4)}`;
}

/** O gunun gorevleri (`sira`, sonra `id` ile sirali). Devredilenler dahildir. */
export function gunGorevleri(gorevler: readonly PlanGorevi[], gun: string): PlanGorevi[] {
  return gorevler
    .filter((g) => g.gun === gun)
    .sort((a, b) => a.sira - b.sira || a.id.localeCompare(b.id));
}

/** Sunucunun durum kurali: >= hedef `tamam`, 0 < x < hedef `kismen`, 0 `yapilmadi`. */
export function gorevDurumuHesapla(hedef: number, gerceklesen: number): PlanGorevDurumu {
  if (gerceklesen >= hedef) return 'tamam';
  if (gerceklesen > 0) return 'kismen';
  return 'yapilmadi';
}

/** Devredilen gorevler sayilmaz (yerine yeni gorev vardir). */
export function gorevSayilari(gorevler: readonly PlanGorevi[]): { toplam: number; tamam: number } {
  const aktif = gorevler.filter((g) => g.durum !== 'devredildi');
  return { toplam: aktif.length, tamam: aktif.filter((g) => g.durum === 'tamam').length };
}

/** Bir gorevin ilerleme orani (0-1). */
export function gorevOrani(g: Pick<PlanGorevi, 'hedefMiktar' | 'gerceklesen'>): number {
  if (g.hedefMiktar <= 0) return 0;
  return Math.min((g.gerceklesen ?? 0) / g.hedefMiktar, 1);
}

/** Bir sonraki gun (varsayilan devir hedefi). */
export function yarinGunu(gun: string): string {
  return tarihEkle(gun, 1);
}

/** Planlanan / gerceklesen toplam (soru ve dakika ayri). */
export function haftaOzeti(gorevler: readonly PlanGorevi[]): {
  soru: { planlanan: number; gerceklesen: number };
  dakika: { planlanan: number; gerceklesen: number };
} {
  const ozet = {
    soru: { planlanan: 0, gerceklesen: 0 },
    dakika: { planlanan: 0, gerceklesen: 0 },
  };
  for (const g of gorevler) {
    if (g.durum === 'devredildi') continue;
    const hedef = ozet[g.hedefTuru];
    hedef.planlanan += g.hedefMiktar;
    hedef.gerceklesen += g.gerceklesen ?? 0;
  }
  return ozet;
}
