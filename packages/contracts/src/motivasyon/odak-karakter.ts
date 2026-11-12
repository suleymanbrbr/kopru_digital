import { z } from 'zod';

import { MotivasyonKozmetikSlotSema } from './api.js';

/**
 * `motivasyon` servisi: odak oturumlari, haftanin yildizi, karakter ve kozmetik uclari
 * (docs/schema/motivasyon.md "Odak oturumlari", "haftanin_yildizlari", "Karakter").
 * Alanlar `snake_case`. Hepsi `/v1/motivasyon/kurumlar/{kurum_id}/...` altindadir; yol kurumu JWT'deki
 * kurumla ayni olmali (aksi 403). `oyunlastirma` modulu kapaliysa her uc `403 modul_kapali` doner.
 */

const zaman = z.iso.datetime({ offset: true });
const tarih = z.iso.date();

export const motivasyonKurumParamSema = z.object({ kurum_id: z.uuid() });

// --- Odak oturumlari -------------------------------------------------------------------------

/** Odak modlari: 25/5 (25 dk), 50/10 (50 dk), serbest (`planlanan_dk` 5-180 istemciden). */
export const ODAK_MODLARI = ['25_5', '50_10', 'serbest'] as const;
export const OdakModuSema = z.enum(ODAK_MODLARI);
export type OdakModu = z.infer<typeof OdakModuSema>;

export const ODAK_DURUMLARI = ['devam', 'tamam', 'yarida'] as const;
export const OdakDurumuSema = z.enum(ODAK_DURUMLARI);

export const ODAK_AZAMI_DK = 180;
export const ODAK_AZAMI_ACIK_SAAT = 6;

const bransKodu = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9_]+$/);

/**
 * Odak oturumu baslat. `istemci_id` istemcinin urettigi UUIDv7'dir; ayni kimlikle tekrar gelen istek ayni
 * oturumu doner (idempotent). `baslangic_at` cevrimdisi baslayan oturum icindir (varsayilan sunucu "simdi";
 * gelecekte ya da 24 saatten eski olamaz).
 */
export const OdakBaslatIstegiSema = z
  .object({
    istemci_id: z.uuid(),
    mod: OdakModuSema,
    /** `serbest` modda zorunlu (5-180); 25_5 ve 50_10'da verilmez ya da moda esit olmali. */
    planlanan_dk: z.number().int().min(5).max(ODAK_AZAMI_DK).optional(),
    baslangic_at: zaman.optional(),
    brans_kodu: bransKodu.optional(),
    /** `ogrenme.plan_gorevleri.id`; "gerceklesen" yazimi api'nin isidir, burada yalniz saklanir. */
    plan_gorev_id: z.uuid().optional(),
    cihaz: z.string().min(1).max(100).optional(),
  })
  .superRefine((v, ctx) => {
    const sabit = v.mod === '25_5' ? 25 : v.mod === '50_10' ? 50 : null;
    if (sabit === null && v.planlanan_dk === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['planlanan_dk'],
        message: 'Serbest modda planlanan_dk gerekir.',
      });
    }
    if (sabit !== null && v.planlanan_dk !== undefined && v.planlanan_dk !== sabit) {
      ctx.addIssue({
        code: 'custom',
        path: ['planlanan_dk'],
        message: `Bu modda planlanan_dk ${String(sabit)} olmalı.`,
      });
    }
  });
export type OdakBaslatIstegi = z.infer<typeof OdakBaslatIstegiSema>;

export const OdakOturumuSema = z.object({
  id: z.uuid(),
  istemci_id: z.uuid(),
  baslangic_at: zaman,
  bitis_at: zaman.nullable(),
  planlanan_dk: z.number().int().min(5).max(ODAK_AZAMI_DK),
  /** Sunucuda hesaplanan, ust sinirli sure (saniye). `devam` iken 0. */
  gerceklesen_sn: z.number().int().min(0),
  durum: OdakDurumuSema,
  brans_kodu: z.string().nullable(),
  plan_gorev_id: z.uuid().nullable(),
  cihaz: z.string().nullable(),
});
export type OdakOturumu = z.infer<typeof OdakOturumuSema>;

export const OdakParamSema = z.object({ kurum_id: z.uuid(), istemci_id: z.uuid() });

/**
 * Odak oturumunu bitir. `bitis_at` cevrimdisi bitis icindir; baslangictan once ya da simdiden sonra ise
 * sinira cekilir. Sure: `LEAST(bitis - baslangic, planlanan_dk*60 + 60, 3 saat)`.
 */
export const OdakBitirIstegiSema = z.object({
  durum: z.enum(['tamam', 'yarida']),
  bitis_at: zaman.optional(),
});

export const OdakKazanimiSema = z.object({
  /** Bu bitirmeden yazilan XP (tavan sonrasi). Tekrar bitirmede defterdeki toplam. */
  xp: z.number().int().min(0),
  /** Yalniz ilk bitirmede dogru olabilir. */
  seviye_atladi: z.boolean(),
  yeni_rozetler: z.array(z.string()),
  /**
   * Geriye donuk bildirilen (baslangic_at ile sunucunun oturumu gordugu an arasi, 2 dk kayma payi dusulmus)
   * sureden XP/aktivite/rozet sayacina sayilan saniye. Gunluk pay `odak.dogrulanmamis_gunluk_azami_dk` (30).
   */
  dogrulanmamis_sayilan_sn: z.number().int().min(0),
  /** Gunluk paya takilip sayilmayan saniye (oturumda gorunur, XP/aktivite/rozete girmez). */
  dogrulanmamis_sayilmayan_sn: z.number().int().min(0),
});

export const OdakBitirYanitiSema = z.object({
  oturum: OdakOturumuSema,
  kazanim: OdakKazanimiSema,
});

export const OdakBaslatYanitiSema = OdakOturumuSema;

export const OdakAcikYanitiSema = z.object({ oturum: OdakOturumuSema.nullable() });

export const OdakListeSorgusuSema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const OdakListeYanitiSema = z.object({ oturumlar: z.array(OdakOturumuSema) });

/** `409 acik_oturum_var`: `details.oturum` mevcut acik oturumdur. */
export const OdakAcikOturumHatasiSema = z.object({ oturum: OdakOturumuSema });

// --- Haftanin yildizi ------------------------------------------------------------------------

export const YILDIZ_GEREKCE_AZAMI = 200;

export const YildizVerIstegiSema = z.object({
  ogrenci_id: z.uuid(),
  grup_id: z.uuid(),
  gerekce: z.string().trim().max(YILDIZ_GEREKCE_AZAMI).optional(),
});

export const HaftaninYildiziSema = z.object({
  id: z.uuid(),
  ogrenci_id: z.uuid(),
  veren_ogretmen_id: z.uuid(),
  grup_id: z.uuid(),
  /** Pazartesi (kurum saatiyle 04:00 kurali). */
  hafta_baslangic: tarih,
  gerekce: z.string().nullable(),
  created_at: zaman,
});
export type HaftaninYildizi = z.infer<typeof HaftaninYildiziSema>;

export const YildizVerYanitiSema = z.object({
  yildiz: HaftaninYildiziSema,
  /** Ogrenciye yazilan XP (haftanin_yildizi kurali, tavandan muaf). */
  xp: z.number().int().min(0),
  yeni_rozetler: z.array(z.string()),
});

export const YildizVerdiklerimYanitiSema = z.object({
  hafta_baslangic: tarih,
  /** Ogretmen icin haftalik sinir; yonetici/sahip icin `null` (sinirsiz). */
  limit: z.number().int().nullable(),
  verilen: z.number().int().min(0),
  /** Ogretmen icin kalan hak; yonetici/sahip icin `null`. */
  kalan: z.number().int().nullable(),
  yildizlar: z.array(HaftaninYildiziSema),
});

export const YildizOgrenciParamSema = z.object({ kurum_id: z.uuid(), ogrenci_id: z.uuid() });
export const YildizAldiklariYanitiSema = z.object({ yildizlar: z.array(HaftaninYildiziSema) });

// --- Karakter --------------------------------------------------------------------------------

export const KARAKTER_AD_AZAMI = 24;

export const KarakterAsamaTanimiSema = z.object({
  asama: z.number().int().min(1).max(5),
  ad: z.string(),
  gereken_seviye: z.number().int().min(1),
});
export const KarakterTuruSema = z.object({
  kod: z.string(),
  ad: z.string(),
  asamalar: z.array(KarakterAsamaTanimiSema),
});
export const KarakterTurleriYanitiSema = z.object({ turler: z.array(KarakterTuruSema) });

export const KarakterDetaySema = z.object({
  tur_kodu: z.string(),
  tur_adi: z.string(),
  ad: z.string(),
  /** Mevcut seviyeden hesaplanir (geri dusmez). */
  asama: z.number().int().min(1).max(5),
  asama_adi: z.string(),
  sonraki_asama_seviyesi: z.number().int().nullable(),
  /** 1: tur bir kez daha degistirilebilir; 0: hak kullanildi. */
  tur_degistirme_hakki: z.number().int().min(0).max(1),
  secildi_at: zaman,
  kusanilanlar: z.array(z.object({ slot: MotivasyonKozmetikSlotSema, kozmetik_kodu: z.string() })),
});
export type KarakterDetay = z.infer<typeof KarakterDetaySema>;

export const KarakterYanitiSema = z.object({ karakter: KarakterDetaySema.nullable() });

/** Ad: 1-24 karakter, harf/rakam/bosluk; uygunsuz ise `422 karakter_adi_uygunsuz`. */
const karakterAdi = z.string().trim().min(1).max(KARAKTER_AD_AZAMI);
export const KarakterSecIstegiSema = z.object({
  tur_kodu: z.string().min(1).max(40),
  ad: karakterAdi,
});
export const KarakterTurDegistirIstegiSema = z.object({ tur_kodu: z.string().min(1).max(40) });
export const KarakterAdDegistirIstegiSema = z.object({ ad: karakterAdi });

export const KozmetikAcilmaKosuluSema = z.object({
  rozet: z.string().optional(),
  rozet_adi: z.string().optional(),
  seviye: z.number().int().optional(),
  seri: z.number().int().optional(),
});

export const KozmetikSema = z.object({
  kod: z.string(),
  slot: MotivasyonKozmetikSlotSema,
  ad: z.string(),
  nadirlik: z.enum(['yaygin', 'nadir', 'efsanevi']),
  sahip: z.boolean(),
  acildi_at: zaman.nullable(),
  kusanildi: z.boolean(),
  /** Sahip olunmayanlar icin acilma kosulu (rozet / seviye / seri); sahip olunanlarda da gelir. */
  acilma_kosulu: KozmetikAcilmaKosuluSema,
});
export const KozmetiklerYanitiSema = z.object({ kozmetikler: z.array(KozmetikSema) });

export const KusanimParamSema = z.object({
  kurum_id: z.uuid(),
  slot: MotivasyonKozmetikSlotSema,
});
export const KusanIstegiSema = z.object({ kozmetik_kodu: z.string().min(1).max(60) });
