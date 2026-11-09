import { tlMetniniKurusaCevir, t } from '@kopru/i18n';

/**
 * Takvim, yoklama ve finans ekranlarinin saf yardimcilari (form dogrulama, rozet esigi, yoklama
 * govdesi, WhatsApp baglantisi). Para yalniz tam sayi kurustur; kayan nokta aritmetigi yoktur.
 */

// --- Kalan ders rozeti -----------------------------------------------------------------------

export type KrediDurumu = 'yok' | 'normal' | 'dusuk' | 'bitti';

/**
 * Kalan ders rozeti: `esik` ve alti sari (`dusuk`), 0 ve alti kirmizi (`bitti`). Yalniz paket modelindeki
 * ogrenci icin anlamlidir; baska modelde rozet gosterilmez (`yok`).
 */
export function krediDurumu(model: string, kalan: number, esik: number): KrediDurumu {
  if (model !== 'paket') return 'yok';
  if (kalan <= 0) return 'bitti';
  if (kalan <= esik) return 'dusuk';
  return 'normal';
}

// --- Para girisi -----------------------------------------------------------------------------

export type TutarSonucu = { ok: true; kurus: number } | { ok: false };

/** TL metnini kurusa cevirir; bos, sifir, negatif ya da gecersiz girdi `ok: false`. */
export function tutarCoz(metin: string): TutarSonucu {
  const kurus = tlMetniniKurusaCevir(metin.trim());
  return kurus !== null && kurus > 0 ? { ok: true, kurus } : { ok: false };
}

// --- Ders formu ------------------------------------------------------------------------------

export interface DersFormu {
  grupId: string;
  tarih: string;
  saat: string;
  sureDk: string;
  brans: string;
  tekrarla: boolean;
  bitisTarihi: string;
  online: string;
  yer: string;
}

export type DersFormHatalari = Partial<Record<'grup' | 'tarih' | 'saat' | 'sure' | 'bitis' | 'online', string>>;

const SAAT = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Ders formunu dogrular; hata mesajlari `operasyon.takvim.hata.*`tir. Bos nesne = gecerli. */
export function dersFormunuDogrula(f: DersFormu): DersFormHatalari {
  const hata: DersFormHatalari = {};
  if (!f.grupId) hata.grup = t('operasyon.takvim.hata.grup');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.tarih)) hata.tarih = t('operasyon.takvim.hata.tarih');
  if (!SAAT.test(f.saat)) hata.saat = t('operasyon.takvim.hata.saat');
  const sure = Number(f.sureDk);
  if (!Number.isInteger(sure) || sure < 10 || sure > 480) {
    hata.sure = t('operasyon.takvim.hata.sure');
  }
  if (f.tekrarla && f.bitisTarihi && f.bitisTarihi < f.tarih) {
    hata.bitis = t('operasyon.takvim.hata.bitis');
  }
  if (f.online.trim() && !/^https?:\/\/\S+$/i.test(f.online.trim())) {
    hata.online = t('operasyon.takvim.hata.online');
  }
  return hata;
}

const GUN_KODLARI = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

/** Haftalik tekrar kurali: baslangic gununun haftanin gunune gore (`0` = Pazartesi). */
export function haftalikKural(haftaninGunu: number): string {
  return `FREQ=WEEKLY;INTERVAL=1;BYDAY=${GUN_KODLARI[haftaninGunu] ?? 'MO'}`;
}

// --- Yoklama ---------------------------------------------------------------------------------

export type YoklamaDurumu = 'geldi' | 'gelmedi' | 'izinli' | 'gec';

export interface YoklamaGirdisi {
  durum: YoklamaDurumu;
  gecDakika: string;
  not: string;
  ogrenciyeGorunsun: boolean;
}

export interface YoklamaSatiri {
  ogrenci_id: string;
  durum: YoklamaDurumu;
  gec_dakika?: number;
  not: string | null;
  not_gorunurluk: 'ogretmene_ozel' | 'ogrenciye';
  isaretlenme_at: string;
}

/** `gec` icin dakika 1-240 olmali; degilse hata mesaji doner. */
export function gecDakikaHatasi(g: YoklamaGirdisi): string | null {
  if (g.durum !== 'gec') return null;
  const dk = Number(g.gecDakika);
  return Number.isInteger(dk) && dk >= 1 && dk <= 240 ? null : t('operasyon.yoklama.hata.gecDakika');
}

/** Form durumundan `PUT .../yoklamalar` satirlarini uretir. Not yoksa gorunurluk "bana ozel"e iner. */
export function yoklamaSatirlari(
  girdiler: Readonly<Record<string, YoklamaGirdisi>>,
  isaretlenme: string,
): YoklamaSatiri[] {
  return Object.entries(girdiler).map(([ogrenciId, g]) => {
    const not = g.not.trim();
    return {
      ogrenci_id: ogrenciId,
      durum: g.durum,
      ...(g.durum === 'gec' ? { gec_dakika: Number(g.gecDakika) } : {}),
      not: not.length > 0 ? not : null,
      not_gorunurluk: not.length > 0 && g.ogrenciyeGorunsun ? 'ogrenciye' : 'ogretmene_ozel',
      isaretlenme_at: isaretlenme,
    };
  });
}

// --- WhatsApp hatirlatmasi -------------------------------------------------------------------

/** E.164 ya da yerel telefondan `wa.me` icin yalniz rakam; gecersizse `null`. */
export function waNumarasi(telefon: string | null): string | null {
  if (!telefon) return null;
  const rakam = telefon.replace(/\D/g, '');
  const ulusal = rakam.startsWith('90') && rakam.length === 12 ? rakam.slice(2) : rakam;
  const yerel = ulusal.startsWith('0') && ulusal.length === 11 ? ulusal.slice(1) : ulusal;
  return /^5\d{9}$/.test(yerel) ? `90${yerel}` : null;
}

export function whatsappBaglantisi(telefon: string | null, metin: string): string | null {
  const no = waNumarasi(telefon);
  return no ? `https://wa.me/${no}?text=${encodeURIComponent(metin)}` : null;
}
