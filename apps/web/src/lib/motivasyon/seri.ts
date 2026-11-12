import type { MotivasyonSeriDetayi, MotivasyonSeriGunDurumu } from '@kopru/contracts';
import { t, type MessageKey } from '@kopru/i18n';

type Hedef = MotivasyonSeriDetayi['hedefler'][number];

/** Takvim gunu: simge adi (renge dayanmayan ayirt edici) ve metin. */
export interface GunGosterimi {
  durum: MotivasyonSeriGunDurumu;
  /** Hucredeki simge (renge dayanmayan ayirt edici); bilesen lucide ikonuna esler. */
  simge: GunSimgesi;
  etiket: string;
}

export type GunSimgesi = 'tik' | 'kar' | 'duraklat' | 'onarim' | 'nokta';

const SIMGELER: Record<MotivasyonSeriGunDurumu, GunSimgesi> = {
  aktif: 'tik',
  dondurma: 'kar',
  duraklatma: 'duraklat',
  onarim: 'onarim',
  kacirildi: 'nokta',
  yok: 'nokta',
};

/**
 * Takvim gunu metni. `yok` ve `kacirildi` "kacirdin" diye gosterilmez (suclayan dil yok): nötr bir
 * "calisilmayan gun" / "kayit yok" denir.
 */
export function gunGosterimi(durum: MotivasyonSeriGunDurumu): GunGosterimi {
  return { durum, simge: SIMGELER[durum], etiket: t(`motivasyon.seri.gun.${durum}`) };
}

/** `2026-11-12` -> "12 Kasım" (UTC: tarih saf takvim gunudur). */
export function gunKisa(tarih: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${tarih}T00:00:00Z`));
}

/** Hedefin tamamlanmasi icin ne gerektigi: "12 dk odak daha", "1 ödev daha". */
export function hedefKalanMetni(h: Hedef): string {
  return t(`motivasyon.seri.hedef.kalan.${h.tur}` as MessageKey, { n: h.kalan });
}

export function hedefAdi(h: Hedef): string {
  return t(`motivasyon.seri.hedef.ad.${h.tur}` as MessageKey);
}

/** "12 / 20 dk" gibi ilerleme metni. */
export function hedefIlerlemeMetni(h: Hedef): string {
  return t(`motivasyon.seri.hedef.ilerleme.${h.tur}` as MessageKey, {
    yapilan: Math.min(h.yapilan, h.esik),
    esik: h.esik,
  });
}

/** Seri basligindaki ana cumle (suclayan dil yok). */
export function seriMesaji(
  s: Pick<MotivasyonSeriDetayi, 'mevcut_seri' | 'en_uzun_seri' | 'bugun_aktif'>,
): string {
  if (s.mevcut_seri > 0) return t('motivasyon.seri.mevcut', { n: s.mevcut_seri });
  if (s.en_uzun_seri > 0) return t('motivasyon.seri.rekorYeni', { n: s.en_uzun_seri });
  return t('motivasyon.seri.ilkGun');
}

/**
 * Onarim penceresi aciksa "Seriyi kurtarmak icin bugun ..." cumlesi; herhangi bir hedef yeter.
 * Pencere kapaliysa `null`.
 */
export function onarimMetni(s: Pick<MotivasyonSeriDetayi, 'onarim'>): string | null {
  const o = s.onarim;
  if (!o || o.hedefler.length === 0) return null;
  const secenekler = o.hedefler
    .map((h) => hedefKalanMetni(h))
    .join(` ${t('motivasyon.seri.veya')} `);
  return t('motivasyon.seri.onarimMetni', { n: o.bozulan_seri, secenekler });
}

/** Takvimi 7'li hafta satirlarina boler (son satir eksik olabilir). */
export function haftalaraBol<T>(gunler: readonly T[], boyut = 7): T[][] {
  const satirlar: T[][] = [];
  for (let i = 0; i < gunler.length; i += boyut) satirlar.push(gunler.slice(i, i + boyut));
  return satirlar;
}

/** Takvimin ozet cumlesi (erisilebilir metin alternatifi): kac gun aktif, dondurma, duraklatma. */
export function takvimOzeti(gunler: MotivasyonSeriDetayi['gunler']): string {
  const say = (d: MotivasyonSeriGunDurumu) => gunler.filter((g) => g.durum === d).length;
  return t('motivasyon.seri.takvimOzeti', {
    gun: gunler.length,
    aktif: say('aktif'),
    dondurma: say('dondurma'),
    duraklatma: say('duraklatma'),
    onarim: say('onarim'),
  });
}
