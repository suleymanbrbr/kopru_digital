import { z } from 'zod';

import type { ModulKodu } from './moduller.js';

/**
 * Rol -> izin -> kapsam sozlugu (ADR 0004). Tek dogruluk kaynagi bu dosyadir:
 *  - api, migrate sirasinda `hesap.roller / izinler / rol_izinleri` tablolarini bundan esitler,
 *  - servisler izin kararini bu sabitten verir (veritabani sorgusu yapmaz).
 * Degisiklik `IZIN_SOZLUGU_SURUMU` (JWT `pv` claim'i) degerini artirir.
 */
export const IZIN_SOZLUGU_SURUMU = 3;

export const ROLLER = ['sahip', 'yonetici', 'ogretmen', 'ogrenci', 'veli'] as const;
export const RolSema = z.enum(ROLLER);
export type Rol = z.infer<typeof RolSema>;

/** Genislik sirasiyla: kendi < grup < sube < kurum. */
export const KAPSAMLAR = ['kendi', 'grup', 'sube', 'kurum'] as const;
export const KapsamSema = z.enum(KAPSAMLAR);
export type Kapsam = z.infer<typeof KapsamSema>;

/** Izin anahtari -> ait oldugu modul (null: cekirdek, kapatilamaz) ve aciklama. */
export const IZINLER = {
  'kurum.oku': { modul: null, aciklama: 'Kurum temel bilgilerini görme' },
  'kurum.ayar.yaz': { modul: null, aciklama: 'Kurum bilgilerini ve görünümünü düzenleme' },
  'kurum.kapat': { modul: null, aciklama: 'Kurumu kapatma' },
  'uyelik.oku': { modul: null, aciklama: 'Üyeleri listeleme' },
  'uyelik.yaz': { modul: null, aciklama: 'Üyelik ekleme, rol ve durum değiştirme' },
  'rol.yonet': { modul: null, aciklama: 'Sahip ve yönetici atama' },
  'kademe.oku': { modul: null, aciklama: 'Kademeleri görme' },
  'kademe.yaz': { modul: null, aciklama: 'Kademe ekleme ve düzenleme' },
  'grup.oku': { modul: null, aciklama: 'Grupları görme' },
  'grup.yaz': { modul: null, aciklama: 'Grup ve atama yönetimi' },
  'davet.yaz': { modul: null, aciklama: 'Davet oluşturma' },
  'modul.ayar.oku': { modul: null, aciklama: 'Modül ayarlarını görme' },
  'modul.ayar.yaz': { modul: null, aciklama: 'Modülleri açıp kapatma' },
  'takvim.oku': { modul: 'takvim', aciklama: 'Ders takvimini görme' },
  'takvim.yaz': { modul: 'takvim', aciklama: 'Ders planlama ve düzenleme' },
  'yoklama.oku': { modul: 'yoklama', aciklama: 'Yoklamayı görme' },
  'yoklama.yaz': { modul: 'yoklama', aciklama: 'Yoklama alma' },
  'geri_bildirim.ver': { modul: 'geri_bildirim', aciklama: 'Derse geri bildirim verme' },
  'kayit.oku': { modul: 'kayitlar', aciklama: 'Ders kayıt ve materyallerini görme' },
  'kayit.yaz': { modul: 'kayitlar', aciklama: 'Ders kayıt ve materyali ekleme' },
  'finans.oku': { modul: 'finans', aciklama: 'Kredi ve bakiye bilgisini görme' },
  'finans.tahsilat.yaz': { modul: 'finans', aciklama: 'Tahsilat ve paket satışı kaydetme' },
  'finans.paket.yaz': {
    modul: 'finans',
    aciklama: 'Paket şablonu, ücret tarifesi, kredi politikası ve finans ayarı düzenleme',
  },
  'odev.oku': { modul: 'odev', aciklama: 'Ödevleri görme' },
  'odev.ver': { modul: 'odev', aciklama: 'Ödev verme' },
  'odev.teslim': { modul: 'odev', aciklama: 'Ödev teslim etme' },
  'odev.incele': { modul: 'odev', aciklama: 'Teslim edilen ödevi inceleme' },
  'plan.oku': { modul: 'haftalik_plan', aciklama: 'Haftalık planı görme' },
  'plan.yaz': { modul: 'haftalik_plan', aciklama: 'Haftalık plan oluşturma ve güncelleme' },
  'deneme.oku': { modul: 'deneme', aciklama: 'Deneme sonuçlarını görme' },
  'deneme.yaz': { modul: 'deneme', aciklama: 'Deneme sonucu girme' },
  'soru.sor': { modul: 'soru_sor', aciklama: 'Soru sorma' },
  'soru.cevapla': { modul: 'soru_sor', aciklama: 'Soruları cevaplama' },
  'oyunlastirma.oku': { modul: 'oyunlastirma', aciklama: 'XP, seri ve rozetleri görme' },
  'duyuru.oku': { modul: 'duyuru', aciklama: 'Duyuruları görme' },
  'duyuru.yaz': { modul: 'duyuru', aciklama: 'Duyuru yazma' },
} as const satisfies Record<string, { modul: ModulKodu | null; aciklama: string }>;

export type IzinKodu = keyof typeof IZINLER;
export const IZIN_KODLARI = Object.keys(IZINLER) as IzinKodu[];
export const IzinKoduSema = z.enum(IZIN_KODLARI as [IzinKodu, ...IzinKodu[]]);

type Esleme = Partial<Record<IzinKodu, Kapsam>>;

/** Verilen izinlerin hepsine ayni kapsami atar. */
const hepsi = (kapsam: Kapsam, haric: IzinKodu[] = []): Esleme =>
  Object.fromEntries(IZIN_KODLARI.filter((k) => !haric.includes(k)).map((k) => [k, kapsam]));

/**
 * Rol -> izin -> en genis kapsam. Kapsam kisitlari daralir: `kurum` izni `sube`/`grup`/`kendi`yi kapsar.
 * `sube` kapsamli rol: yonetici uyeliginin `sube_id` dolu ise uygulanir (uyelik daraltir).
 */
export const ROL_IZINLERI: Record<Rol, Esleme> = {
  sahip: hepsi('kurum'),
  yonetici: hepsi('kurum', ['rol.yonet', 'kurum.kapat']),
  ogretmen: {
    'kurum.oku': 'kurum',
    'uyelik.oku': 'grup',
    'kademe.oku': 'kurum',
    'grup.oku': 'grup',
    // Ogretmen yalniz atandigi gruba ogrenci davet eder (kapsam sunucuda zorlanir).
    'davet.yaz': 'grup',
    'modul.ayar.oku': 'kurum',
    'takvim.oku': 'grup',
    'takvim.yaz': 'grup',
    'yoklama.oku': 'grup',
    'yoklama.yaz': 'grup',
    'kayit.oku': 'grup',
    'kayit.yaz': 'grup',
    // Ogretmen kendi ogrencilerinde paket satar ve tahsilat alir; sablon/tarife/politika yonetemez.
    'finans.oku': 'grup',
    'finans.tahsilat.yaz': 'grup',
    'odev.oku': 'grup',
    'odev.ver': 'grup',
    'odev.incele': 'grup',
    'plan.oku': 'grup',
    'plan.yaz': 'grup',
    'deneme.oku': 'grup',
    'deneme.yaz': 'grup',
    'soru.cevapla': 'grup',
    'duyuru.oku': 'kurum',
    'duyuru.yaz': 'grup',
  },
  ogrenci: {
    'kurum.oku': 'kurum',
    'uyelik.oku': 'kendi',
    'kademe.oku': 'kurum',
    'grup.oku': 'kendi',
    'modul.ayar.oku': 'kurum',
    'takvim.oku': 'kendi',
    'yoklama.oku': 'kendi',
    'geri_bildirim.ver': 'kendi',
    'kayit.oku': 'kendi',
    'finans.oku': 'kendi',
    'odev.oku': 'kendi',
    'odev.teslim': 'kendi',
    'plan.oku': 'kendi',
    'plan.yaz': 'kendi',
    'deneme.oku': 'kendi',
    'deneme.yaz': 'kendi',
    'soru.sor': 'kendi',
    'oyunlastirma.oku': 'kendi',
    'duyuru.oku': 'kurum',
  },
  // Faz 1'de veli arayuzu ve uc noktasi yok; yalnizca temel erisim.
  veli: {
    'kurum.oku': 'kurum',
    'uyelik.oku': 'kendi',
  },
};

const kapsamSirasi: Record<Kapsam, number> = { kendi: 0, grup: 1, sube: 2, kurum: 3 };

/** `a` kapsami `b` kapsamindan en az ayni genislikte mi? */
export function kapsamYeterli(a: Kapsam, b: Kapsam): boolean {
  return kapsamSirasi[a] >= kapsamSirasi[b];
}

/** Rolun izin icin sahip oldugu kapsam; izin yoksa `null`. */
export function izinKapsami(rol: Rol, izin: IzinKodu): Kapsam | null {
  return ROL_IZINLERI[rol][izin] ?? null;
}

/** Izin verilmis ve kapsam `enAz` kadar genis mi? */
export function izinVarMi(rol: Rol, izin: IzinKodu, enAz: Kapsam = 'kendi'): boolean {
  const kapsam = izinKapsami(rol, izin);
  return kapsam !== null && kapsamYeterli(kapsam, enAz);
}

/** Izne ait modul kodu (cekirdek izinler icin null). */
export function izinModulu(izin: IzinKodu): ModulKodu | null {
  return IZINLER[izin].modul;
}

export const ROL_ADLARI: Record<Rol, string> = {
  sahip: 'Sahip',
  yonetici: 'Yönetici',
  ogretmen: 'Öğretmen',
  ogrenci: 'Öğrenci',
  veli: 'Veli',
};
