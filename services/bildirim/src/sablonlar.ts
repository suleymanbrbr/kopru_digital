import { BILDIRIM_KATEGORILERI, type BildirimKategori } from '@kopru/contracts';
import { KaliciHata } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import { yeniId, type Islem } from './ortak.js';
import { ESLEME_SABLONLARI } from './sablonlar-eslemeler.js';

/**
 * Bildirim sablonlari. KAYNAK KODDUR (surum kodla birlikte dagitilir); worker acilista
 * `bildirim.sablonlar` tablosuna upsert eder (ayna; operasyon/sonraki kanallar icin). Uretim hatti sablonu
 * bellekteki kayittan okur: veritabani turu gerekmez ve migration gerektirmeden sablon eklenir.
 *
 * Kurallar (docs/schema/bildirim.md):
 * - `{{degisken}}` yer tutuculari yalniz cagiranin verdigi degiskenlerle doldurulur; eksik degisken
 *   `SablonHatasi` (kalici hata) verir, fazlasi yok sayilir.
 * - `kisiselVeri: true` sablon `push` ve `sms` kanalinda tanimlanamaz (kayit dogrulamasi + veritabani CHECK).
 * - Push sablonlari ek olarak kisisel/hassas sayilan degisken adlarini (ad, telefon, e-posta, not, ucret...)
 *   iceremez.
 */

export type SablonKanali = 'kutu' | 'push' | 'eposta' | 'sms';
export const VARSAYILAN_DIL = 'tr';

export interface SablonTanimi {
  kod: string;
  kategori: BildirimKategori;
  kanal: SablonKanali;
  dil?: string;
  baslik?: string;
  govde: string;
  derinBaglanti?: string;
  /** `true` ise yalniz `kutu`/`eposta` kanalinda kullanilabilir. */
  kisiselVeri?: boolean;
}

export type SablonDegiskenleri = Readonly<Record<string, string | number | boolean>>;

export class SablonHatasi extends KaliciHata {
  constructor(mesaj: string) {
    super(mesaj);
    this.name = 'SablonHatasi';
  }
}

const YER_TUTUCU = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;

/** Push metninde yer almamasi gereken (kisisel veri, ucret, not) degisken adlari. */
const YASAK_PUSH_DEGISKENI =
  /(^|_)(ad|soyad|adi|isim|telefon|eposta|email|not|notu|ucret|tutar|kurus|bakiye|metin|mesaj|aciklama)($|_)/;

const KANALLAR: readonly SablonKanali[] = ['kutu', 'push', 'eposta', 'sms'];

export function yerTutucular(metin: string | undefined): string[] {
  if (!metin) return [];
  return [...new Set([...metin.matchAll(YER_TUTUCU)].map((m) => m[1] ?? ''))];
}

/** Sablon tanimini dogrular; kural ihlalinde `SablonHatasi` firlatir. */
export function sablonDogrula(t: SablonTanimi): void {
  const etiket = `${t.kod}/${t.kanal}`;
  if (!/^[a-z0-9_]+$/.test(t.kod)) throw new SablonHatasi(`${etiket}: geçersiz şablon kodu`);
  if (!(BILDIRIM_KATEGORILERI as readonly string[]).includes(t.kategori)) {
    throw new SablonHatasi(`${etiket}: geçersiz kategori`);
  }
  if (!KANALLAR.includes(t.kanal)) throw new SablonHatasi(`${etiket}: geçersiz kanal`);
  if ((t.kanal === 'push' || t.kanal === 'sms') && t.kisiselVeri) {
    throw new SablonHatasi(`${etiket}: kişisel veri içeren şablon push/sms kanalında kullanılamaz`);
  }
  if (t.kanal === 'push' || t.kanal === 'sms') {
    // Derin baglanti kimlik tasir (uuid); yalniz baslik ve govde degisken adlari denetlenir.
    const metinTutuculari = [...yerTutucular(t.baslik), ...yerTutucular(t.govde)];
    const yasak = metinTutuculari.find((d) => YASAK_PUSH_DEGISKENI.test(d));
    if (yasak) {
      throw new SablonHatasi(`${etiket}: push metninde "${yasak}" değişkeni kullanılamaz`);
    }
  }
  if (t.govde.length === 0) throw new SablonHatasi(`${etiket}: gövde boş olamaz`);
}

/** `{{degisken}}` yer tutucularini doldurur; verilmemis degisken `SablonHatasi` verir. */
export function doldur(metin: string, degiskenler: SablonDegiskenleri, etiket = 'şablon'): string {
  return metin.replace(YER_TUTUCU, (_t, ad: string) => {
    const deger = degiskenler[ad];
    if (deger === undefined) throw new SablonHatasi(`${etiket}: "${ad}" değişkeni verilmedi`);
    return String(deger);
  });
}

export interface CozulmusSablon {
  baslik: string;
  govde: string;
  derinBaglanti: string | null;
}

export function sablonuCoz(t: SablonTanimi, degiskenler: SablonDegiskenleri): CozulmusSablon {
  const etiket = `${t.kod}/${t.kanal}`;
  const baslik = doldur(t.baslik ?? '', degiskenler, etiket);
  return {
    baslik,
    govde: doldur(t.govde, degiskenler, etiket),
    derinBaglanti: t.derinBaglanti ? doldur(t.derinBaglanti, degiskenler, etiket) : null,
  };
}

/** Sablon kaydi: `kod` -> kanal -> tanim (tek dil: `tr`). */
export class SablonKaydi {
  private readonly harita = new Map<string, SablonTanimi>();

  constructor(tanimlar: readonly SablonTanimi[]) {
    for (const t of tanimlar) {
      sablonDogrula(t);
      const anahtar = `${t.kod}|${t.kanal}|${t.dil ?? VARSAYILAN_DIL}`;
      if (this.harita.has(anahtar)) throw new SablonHatasi(`yinelenen şablon: ${anahtar}`);
      this.harita.set(anahtar, t);
    }
  }

  bul(kod: string, kanal: SablonKanali, dil = VARSAYILAN_DIL): SablonTanimi | undefined {
    return this.harita.get(`${kod}|${kanal}|${dil}`);
  }

  hepsi(): SablonTanimi[] {
    return [...this.harita.values()];
  }
}

/**
 * Faz 1 sablonlari. Yeni olay eslemesi eklerken once buraya `kutu` (ve push gerekiyorsa `push`) sablonu
 * eklenir. Push metni GENELdir (ad, not, ucret, odev metni yok); ayrinti kutuda ve derin baglantidadir.
 */
export const SABLON_TANIMLARI: readonly SablonTanimi[] = [
  {
    kod: 'soru_cevaplandi',
    kategori: 'soru',
    kanal: 'kutu',
    baslik: 'Sorun cevaplandı',
    govde: 'Sorduğun soruya cevap geldi. Açıp bakabilirsin.',
    derinBaglanti: 'kopru://soru/{{soru_id}}',
  },
  {
    kod: 'soru_cevaplandi',
    kategori: 'soru',
    kanal: 'push',
    baslik: 'Sorun cevaplandı',
    govde: 'Sorduğun soruya cevap geldi.',
    derinBaglanti: 'kopru://soru/{{soru_id}}',
  },
  {
    kod: 'seri_hatirlatma',
    kategori: 'oyunlastirma',
    kanal: 'kutu',
    baslik: 'Serini koru!',
    govde: '{{mevcut_seri}} günlük serin bugün bitebilir. Küçük bir görevle devam ettir.',
    derinBaglanti: 'kopru://bugun',
  },
  {
    kod: 'seri_hatirlatma',
    kategori: 'oyunlastirma',
    kanal: 'push',
    baslik: 'Serini koru!',
    govde: '{{mevcut_seri}} günlük serin bugün bitebilir. Küçük bir görevle devam ettir.',
    derinBaglanti: 'kopru://bugun',
  },
  // Olay eslemelerinin sablonlari (paket B2).
  ...ESLEME_SABLONLARI,
];

export const sablonlar = new SablonKaydi(SABLON_TANIMLARI);

/**
 * Kodlu sablonlari `bildirim.sablonlar` tablosuna esler (worker acilisi; `bildirim_sistem` ya da tablo
 * yazma yetkili baglanti). Idempotent: icerik degismediyse satir ve `surum` degismez.
 */
export async function sablonlariYukle(tx: Islem, kayit: SablonKaydi = sablonlar): Promise<number> {
  let degisen = 0;
  for (const t of kayit.hepsi()) {
    const sonuc = await tx.execute(sql`
      insert into bildirim.sablonlar
        (id, kod, kategori, kanal, dil, baslik, govde, derin_baglanti, kisisel_veri_iceriyor)
      values (${yeniId()}, ${t.kod}, ${t.kategori}, ${t.kanal}, ${t.dil ?? VARSAYILAN_DIL},
              ${t.baslik ?? null}, ${t.govde}, ${t.derinBaglanti ?? null}, ${t.kisiselVeri ?? false})
      on conflict (kod, kanal, dil) do update
        set kategori = excluded.kategori, baslik = excluded.baslik, govde = excluded.govde,
            derin_baglanti = excluded.derin_baglanti,
            kisisel_veri_iceriyor = excluded.kisisel_veri_iceriyor
      where (bildirim.sablonlar.kategori, bildirim.sablonlar.baslik, bildirim.sablonlar.govde,
             bildirim.sablonlar.derin_baglanti, bildirim.sablonlar.kisisel_veri_iceriyor)
        is distinct from (excluded.kategori, excluded.baslik, excluded.govde,
                          excluded.derin_baglanti, excluded.kisisel_veri_iceriyor)
      returning 1`);
    degisen += sonuc.length;
  }
  return degisen;
}
