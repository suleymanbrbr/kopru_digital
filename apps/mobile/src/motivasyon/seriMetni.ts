import type { MotivasyonSeriGunDurumu } from '@kopru/contracts';
import { t, type MessageKey } from '@kopru/i18n';

import type { SeriDetayi } from '../api/motivasyonTipleri';

type Hedef = SeriDetayi['hedefler'][number];

/** Hedef turunun kisa adi ("3 plan gorevi", "20 dk odak"). */
export function hedefMetni(h: Pick<Hedef, 'tur' | 'esik'>): string {
  return t(`mobil.motivasyon.seri.hedef.${h.tur}` as MessageKey, { n: h.esik });
}

/** "2/3 plan gorevi" bicimi. */
export function hedefIlerlemeMetni(h: Pick<Hedef, 'tur' | 'esik' | 'yapilan'>): string {
  return t(`mobil.motivasyon.seri.hedefIlerleme.${h.tur}` as MessageKey, {
    yapilan: Math.min(h.yapilan, h.esik),
    esik: h.esik,
  });
}

/**
 * Gunun hedef cubugu icin en yakin hedef: hedeflerden herhangi biri yeter, bu yuzden orani en
 * yuksek olan (esitlikte listedeki ilk) gosterilir. Hedef yoksa `null`.
 */
export function enYakinHedef(hedefler: readonly Hedef[]): { hedef: Hedef; oran: number } | null {
  let en: { hedef: Hedef; oran: number } | null = null;
  for (const h of hedefler) {
    const oran = Math.min(h.yapilan / h.esik, 1);
    if (en === null || oran > en.oran) en = { hedef: h, oran };
  }
  return en;
}

/** Seri basligi: suclamayan, seri yokken "bugun baslayabilirsin". */
export function seriBasligi(mevcutSeri: number): string {
  return mevcutSeri > 0
    ? t('mobil.motivasyon.seri.gunluk', { n: mevcutSeri })
    : t('mobil.motivasyon.seri.baslayabilirsin');
}

/** Hedeflerden biri yetsin: "3 plan gorevi ya da 20 dk odak". */
export function hedeflerYaDa(hedefler: readonly Hedef[]): string {
  return hedefler.map(hedefMetni).join(t('mobil.motivasyon.seri.yaDa'));
}

/**
 * Seri durum metni: bugun tamamsa kutlar; onarim penceresi aciksa "Seriyi kurtarmak icin bugun ...";
 * degilse bugunun hedefini soyler. Hicbir cumle "kacirdin" demez.
 */
export function seriDurumMetni(s: SeriDetayi): string {
  if (s.onarim) {
    return t('mobil.motivasyon.seri.onarimMetni', {
      hedef: hedeflerYaDa(s.onarim.hedefler),
      seri: s.onarim.bozulan_seri,
    });
  }
  if (s.bugun_aktif) return t('mobil.motivasyon.seri.bugunTamam');
  if (s.hedefler.length === 0) return '';
  return t('mobil.motivasyon.seri.bugunHedefi', { hedef: hedeflerYaDa(s.hedefler) });
}

/** Sonraki kilometre tasi satiri ("Sıradaki durak: 7 gün, 4 gün kaldı"). */
export function kilometreTasiMetni(s: Pick<SeriDetayi, 'sonraki_kilometre_tasi'>): string | null {
  const k = s.sonraki_kilometre_tasi;
  if (!k) return null;
  return t('mobil.motivasyon.seri.kilometreTasi', { hedef: k.hedef, kalan: k.kalan });
}

/**
 * Takvim gununun etiketi. `yok` gunleri "kacirdin" diye gosterilmez (seri baslamadan once ya da
 * henuz degerlendirilmemis olabilir): yalniz "kayit yok". `kacirildi` yargilamayan "ara verildi".
 */
export function gunDurumuEtiketi(d: MotivasyonSeriGunDurumu): string {
  return t(`mobil.motivasyon.seri.gun.${d}` as MessageKey);
}

export interface TakvimHucresi {
  gun: string | null;
  durum: MotivasyonSeriGunDurumu | null;
  bugun: boolean;
  /** Ayin gunu (1-31). */
  gunNo: number | null;
}

/** Pazartesi = 0. */
export function haftaGunu(gun: string): number {
  return (new Date(`${gun}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * 35 gunluk listeyi Pazartesi-bashli haftalara dizer (ilk haftanin basi bos hucrelerle doldurulur;
 * son hafta tamamlanir).
 */
export function takvimSatirlari(gunler: SeriDetayi['gunler']): TakvimHucresi[][] {
  if (gunler.length === 0) return [];
  const bos: TakvimHucresi = { gun: null, durum: null, bugun: false, gunNo: null };
  const hucreler: TakvimHucresi[] = [];
  const ilk = gunler[0];
  if (ilk) for (let i = 0; i < haftaGunu(ilk.gun); i++) hucreler.push(bos);
  for (const g of gunler) {
    hucreler.push({
      gun: g.gun,
      durum: g.durum,
      bugun: g.bugun,
      gunNo: Number(g.gun.slice(8, 10)),
    });
  }
  while (hucreler.length % 7 !== 0) hucreler.push(bos);
  const satirlar: TakvimHucresi[][] = [];
  for (let i = 0; i < hucreler.length; i += 7) satirlar.push(hucreler.slice(i, i + 7));
  return satirlar;
}

/** Takvim icin ozet cumle (ekran okuyucu): "Son 35 günde 12 gün çalıştın." */
export function takvimOzeti(gunler: SeriDetayi['gunler']): string {
  const aktif = gunler.filter((g) => g.durum === 'aktif' || g.durum === 'onarim').length;
  return t('mobil.motivasyon.seri.takvimOzeti', { n: aktif, toplam: gunler.length });
}
