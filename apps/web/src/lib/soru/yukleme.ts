import type { MedyaDosyaDurumYaniti, MedyaDosyaTuru, MedyaYuklemeYaniti } from '@kopru/contracts';

import { UygulamaHatasi } from '@/lib/api';

/**
 * Medya yukleme akisi (docs/gelistirme.md): `POST /v1/dosyalar` -> presigned `PUT` (tarayicidan dogrudan
 * depolamaya, `yukleme.basliklar` aynen) -> `POST .../tamam` -> `GET` ile `hazir` olana kadar yoklama.
 * Ayni `istemci_anahtari` yeniden denemede ayni kaydi verir; bu yuzden "yeniden dene" ayni anahtarla
 * bastan calistirilir ve onceden tamamlanmis adimlar atlanir. Ag adimlari enjekte edilir (birim test).
 */

// --- Durum makinesi -----------------------------------------------------------------------------

export type YuklemeAsama =
  'bekliyor' | 'hazirlaniyor' | 'yukleniyor' | 'isleniyor' | 'hazir' | 'hata';

export interface YuklemeDurumu {
  asama: YuklemeAsama;
  /** 0..1; yalniz `yukleniyor` asamasinda anlamlidir. */
  ilerleme: number;
  dosyaId: string | null;
  /** Hata kodu (`yuklemeHataKodu`); `asama === 'hata'` iken dolu. */
  hata: string | null;
  /** Kac kez baslatildi (ilk deneme 1). */
  deneme: number;
}

export type YuklemeOlayi =
  | { tur: 'basla' }
  | { tur: 'kayit'; dosyaId: string }
  | { tur: 'ilerleme'; oran: number }
  | { tur: 'yuklendi' }
  | { tur: 'hazir' }
  | { tur: 'hata'; kod: string }
  | { tur: 'sifirla' };

export const YUKLEME_BASLANGIC: YuklemeDurumu = {
  asama: 'bekliyor',
  ilerleme: 0,
  dosyaId: null,
  hata: null,
  deneme: 0,
};

/** Gecersiz gecisler yok sayilir (durum ayni nesne olarak doner). */
export function yuklemeIlerlet(d: YuklemeDurumu, o: YuklemeOlayi): YuklemeDurumu {
  switch (o.tur) {
    case 'basla':
      if (d.asama !== 'bekliyor' && d.asama !== 'hata') return d;
      return { ...d, asama: 'hazirlaniyor', ilerleme: 0, hata: null, deneme: d.deneme + 1 };
    case 'kayit':
      if (d.asama !== 'hazirlaniyor') return d;
      return { ...d, asama: 'yukleniyor', dosyaId: o.dosyaId, ilerleme: 0 };
    case 'ilerleme':
      if (d.asama !== 'yukleniyor') return d;
      return { ...d, ilerleme: Math.min(1, Math.max(0, o.oran)) };
    case 'yuklendi':
      if (d.asama !== 'yukleniyor' && d.asama !== 'hazirlaniyor') return d;
      return { ...d, asama: 'isleniyor', ilerleme: 1 };
    case 'hazir':
      if (d.asama !== 'isleniyor') return d;
      return { ...d, asama: 'hazir', ilerleme: 1 };
    case 'hata':
      if (d.asama === 'hazir' || d.asama === 'bekliyor') return d;
      return { ...d, asama: 'hata', hata: o.kod };
    case 'sifirla':
      return YUKLEME_BASLANGIC;
  }
}

// --- Hata eslemesi ------------------------------------------------------------------------------

export class YuklemeHatasi extends Error {
  constructor(public readonly kod: string) {
    super(kod);
    this.name = 'YuklemeHatasi';
  }
}

const MEDYA_HATA_ESLEME: Record<string, string> = {
  dosya_turu_yetkisi_yok: 'tur_yetkisi_yok',
  mime_desteklenmiyor: 'mime_desteklenmiyor',
  dosya_cok_buyuk: 'cok_buyuk',
  // Medya depolama kotasi; soru kotasi ile ayni kod, yukleme baglaminda ayri ele alinir.
  kota_asildi: 'depolama_kotasi',
  kurum_askida: 'kurum_askida',
  yukleme_suresi_doldu: 'sure_doldu',
  boyut_uyusmazligi: 'bozuk',
  mime_uyusmazligi: 'bozuk',
  depolama_yapilandirilmamis: 'depolama_yok',
};

/** Hata -> `soruSor.yukleme.hata.<kod>` anahtari. */
export function yuklemeHataKodu(hata: unknown): string {
  if (hata instanceof YuklemeHatasi) return hata.kod;
  if (hata instanceof UygulamaHatasi) {
    if (hata.kod === 'ag' || hata.kod === 'hizmet_kullanilamiyor') return 'ag';
    return MEDYA_HATA_ESLEME[hata.kod] ?? 'genel';
  }
  return 'genel';
}

/** Yeniden denemek anlamli mi? (Gecici ag/sunucu hatalari; dosyanin kendisi gecersizse hayir.) */
export function yenidenDenenebilir(kod: string): boolean {
  return ['ag', 'genel', 'islenemedi', 'put_basarisiz', 'sure_doldu', 'zaman_asimi'].includes(kod);
}

// --- Akis ---------------------------------------------------------------------------------------

export interface YuklemeBagimliliklari {
  /** SHA-256 ozeti (kucuk harfli onaltilik). */
  ozet: (blob: Blob) => Promise<string>;
  izinIste: (govde: {
    tur: MedyaDosyaTuru;
    mime_tipi: string;
    boyut_bayt: number;
    sha256: string;
    istemci_anahtari: string;
  }) => Promise<MedyaYuklemeYaniti>;
  put: (
    adres: { url: string; basliklar: Record<string, string> },
    blob: Blob,
    ilerleme: (oran: number) => void,
    sinyal?: AbortSignal,
  ) => Promise<void>;
  tamam: (dosyaId: string) => Promise<MedyaDosyaDurumYaniti>;
  durum: (dosyaId: string) => Promise<MedyaDosyaDurumYaniti>;
  bekle: (ms: number) => Promise<void>;
}

export interface YuklemeSecenekleri {
  tur: MedyaDosyaTuru;
  blob: Blob;
  /** Parametresiz (ornegin `audio/webm`); medya `Content-Type`i bununla karsilastirir. */
  mime: string;
  istemciAnahtari: string;
  sinyal?: AbortSignal;
  yoklamaAraligiMs?: number;
  enFazlaYoklama?: number;
}

export interface YuklemeSonucu {
  dosyaId: string;
  durum: MedyaDosyaDurumYaniti;
}

function kodu(hata: unknown): string | undefined {
  return hata instanceof UygulamaHatasi ? hata.kod : undefined;
}

/**
 * Tek dosyayi yukler ve `hazir` olunca doner. Olaylar `olay` ile bildirilir (durum makinesine verilir).
 * Hata olursa `YuklemeHatasi`/`UygulamaHatasi` firlatir; cagiran `hata` olayini yollar.
 */
export async function dosyaYukle(
  s: YuklemeSecenekleri,
  bag: YuklemeBagimliliklari,
  olay: (o: YuklemeOlayi) => void,
): Promise<YuklemeSonucu> {
  const aralik = s.yoklamaAraligiMs ?? 800;
  const enFazla = s.enFazlaYoklama ?? 60;
  const iptalKontrol = () => {
    if (s.sinyal?.aborted) throw new YuklemeHatasi('iptal');
  };

  olay({ tur: 'basla' });
  const sha256 = await bag.ozet(s.blob);
  iptalKontrol();
  const izin = await bag.izinIste({
    tur: s.tur,
    mime_tipi: s.mime,
    boyut_bayt: s.blob.size,
    sha256,
    istemci_anahtari: s.istemciAnahtari,
  });
  const id = izin.dosya.id;
  olay({ tur: 'kayit', dosyaId: id });

  const bekleyen = izin.dosya.durum === 'yukleme_bekliyor';
  if (bekleyen) {
    if (!izin.yukleme) throw new YuklemeHatasi('sure_doldu');
    iptalKontrol();
    await bag.put(
      { url: izin.yukleme.url, basliklar: izin.yukleme.basliklar },
      s.blob,
      (oran) => {
        olay({ tur: 'ilerleme', oran });
      },
      s.sinyal,
    );
  }
  olay({ tur: 'yuklendi' });

  let durum: MedyaDosyaDurumYaniti | null = null;
  if (bekleyen) {
    // Nesne gorunur olana kadar kisa aralikla tekrar (409 `yukleme_bulunamadi`).
    for (let i = 0; i < 6; i += 1) {
      iptalKontrol();
      try {
        durum = await bag.tamam(id);
        break;
      } catch (hata) {
        if (kodu(hata) !== 'yukleme_bulunamadi' || i === 5) throw hata;
        await bag.bekle(500);
      }
    }
  }

  for (let i = 0; i < enFazla; i += 1) {
    iptalKontrol();
    durum ??= await bag.durum(id);
    if (durum.durum === 'hazir') {
      olay({ tur: 'hazir' });
      return { dosyaId: id, durum };
    }
    if (durum.durum === 'islenemedi' || durum.durum === 'silindi') {
      throw new YuklemeHatasi('islenemedi');
    }
    durum = null;
    await bag.bekle(aralik);
  }
  throw new YuklemeHatasi('zaman_asimi');
}

/**
 * Soru/cevap `api`ya dosya kimlikleriyle gonderilirken, medya `hazir` olsa bile `api` kopyasi henuz
 * gelmemis olabilir: 409 `dosya_hazir_degil` kisa aralikla yeniden denenir.
 */
export async function dosyaHazirDegilDene<T>(
  is: () => Promise<T>,
  bekle: (ms: number) => Promise<void>,
  denemeSayisi = 8,
  aralikMs = 600,
): Promise<T> {
  for (let i = 0; ; i += 1) {
    try {
      return await is();
    } catch (hata) {
      if (kodu(hata) !== 'dosya_hazir_degil' || i >= denemeSayisi - 1) throw hata;
      await bekle(aralikMs);
    }
  }
}

export const bekleMs = (ms: number): Promise<void> =>
  new Promise((coz) => {
    setTimeout(coz, ms);
  });

export async function sha256Hex(blob: Blob): Promise<string> {
  const ozet = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(ozet), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** `PUT` ilerlemesi icin XMLHttpRequest (fetch yukleme ilerlemesi vermez). */
export function putIlerlemeli(
  adres: { url: string; basliklar: Record<string, string> },
  blob: Blob,
  ilerleme: (oran: number) => void,
  sinyal?: AbortSignal,
): Promise<void> {
  return new Promise((coz, reddet) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', adres.url);
    for (const [ad, deger] of Object.entries(adres.basliklar)) xhr.setRequestHeader(ad, deger);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) ilerleme(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) coz();
      else reddet(new YuklemeHatasi(xhr.status === 403 ? 'sure_doldu' : 'put_basarisiz'));
    };
    xhr.onerror = () => {
      reddet(new YuklemeHatasi('ag'));
    };
    xhr.onabort = () => {
      reddet(new YuklemeHatasi('iptal'));
    };
    sinyal?.addEventListener('abort', () => {
      xhr.abort();
    });
    xhr.send(blob);
  });
}
