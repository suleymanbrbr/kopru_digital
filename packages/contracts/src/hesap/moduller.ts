import { z } from 'zod';

/**
 * Kapatilabilen modullerin tek kaynagi (`hesap.modul_ayarlari.modul_kodu`).
 *
 * - api: migration'daki CHECK listesi bu sabitle ayni olmalidir (`services/api/src/db/modul-kodlari.test.ts`).
 * - web ve mobil: modul durumunu ve sekme/menu gorunurlugunu bu anahtarlarla okur.
 * - i18n: kullaniciya gorunen adlar `modul.<kod>` anahtarindadir (`packages/i18n/src/index.test.ts`).
 *
 * Cekirdek alanlar (hesap, bildirim gelen kutusu, medya) kapatilamaz ve bu listede yoktur.
 * Yeni modul eklemek: buraya ekle, yeni migration ile CHECK'i genislet, i18n'e adini yaz.
 */
export const MODUL_KODLARI = [
  'takvim',
  'yoklama',
  'geri_bildirim',
  'kayitlar',
  'finans',
  'odev',
  'haftalik_plan',
  'deneme',
  'soru_sor',
  'oyunlastirma',
  'duyuru',
] as const;
export const ModulKoduSema = z.enum(MODUL_KODLARI);
export type ModulKodu = z.infer<typeof ModulKoduSema>;

/** Istemci tarafinda etkin modul haritasi; eksik anahtar = kapali. */
export type ModulDurumu = Partial<Record<ModulKodu, boolean>>;

export function modulKoduMu(deger: string): deger is ModulKodu {
  return (MODUL_KODLARI as readonly string[]).includes(deger);
}
