import { MODUL_KODLARI } from '@kopru/contracts';

/**
 * Mock modunun paylasimli bellek ici durumu (`NEXT_PUBLIC_API_MOCK=1`). Tek sunucu sureci icin tek
 * kopya; `globalThis` uzerinde tutulur ki Next'in ayri route paketleri ayni durumu gorsun.
 */

export type KurumDurumu = 'aktif' | 'askida' | 'kapali';
export type KurumTuru = 'bireysel' | 'ekip' | 'kurum';

export interface MockKurum {
  id: string;
  ad: string;
  tur: KurumTuru;
  durum: KurumDurumu;
  created_at: string;
  sahip: { kullanici_id: string; telefon: string; eposta: string };
  roller: Record<string, number>;
  diger: number;
  moduller: Record<string, { acik: boolean; ayarVar: boolean; altKapali: number }>;
  beta: { ozellik_kodu: string; acik: boolean; updated_at: string }[];
}

export interface MockDenetim {
  id: string;
  eylem: string;
  created_at: string;
  aktor_kullanici_id: string;
  kurum_id?: string;
  hedef_turu?: string;
  hedef_id?: string;
  neden: string;
  ip: string;
  ayrinti: Record<string, unknown>;
  taklit_kayit_id?: string;
}

export type MockRol = 'destek' | 'yonetici' | 'yok';

export interface MockOturum {
  ikinciAdimDogrulandi: boolean;
  rol: MockRol;
}

export interface MockMesaj {
  id: string;
  baslik: string;
  metin: string;
  onem: 'bilgi' | 'uyari' | 'kritik';
  baslangic_at: string;
  bitis_at: string;
  created_at: string;
  iptal_at?: string;
}

export interface MockKonu {
  id: string;
  ad: string;
  brans_kodu: string;
  seviye: 'unite' | 'konu' | 'alt_konu';
  sinif_seviyesi?: number;
  kazanim_kodu?: string;
  sira: number;
  ust_id?: string;
  /** Taslakta dogdu (yayinli surumde yok). */
  yeni: boolean;
  /** Taslakta kapandi. */
  kapandi: boolean;
  gecerli_surum_baslangic: number;
}

export interface MockDegisiklik {
  id: string;
  created_at: string;
  tur: 'ekle' | 'adlandir' | 'tasi' | 'birlestir' | 'kaldir';
  konu_id: string;
  hedef_konu_id?: string;
  ad_once?: string;
  ad_sonra?: string;
  ayrinti: Record<string, unknown>;
  not: string;
}

export interface MockSurum {
  surum_no: number;
  ad: string;
  aciklama?: string;
  taslak: boolean;
  yayinlandi_at?: string;
  konular: MockKonu[];
  degisiklikler: MockDegisiklik[];
}

export interface MockKurallar {
  xp: number;
  olay_basi_ust_sinir: number | null;
  gec_carpani: number;
  aktif: boolean;
}
export interface MockAyar {
  kurallar: Record<string, MockKurallar>;
  tavanlar: Record<string, number>;
}
export interface MockAyarSurumu {
  surum: number;
  degerler: MockAyar;
  onceki_surum: number | null;
  geri_alinan_surum: number | null;
  degistiren_kullanici_id: string | null;
  neden: string;
  uyarilar: { kod: string; mesaj: string }[];
  created_at: string;
}

export interface MockTaklit {
  taklit_id: string;
  kurum_id: string;
  hedef_kullanici_id: string;
  bitis: number;
  sonlandi: boolean;
}

export interface MockDurum {
  oturumlar: Map<string, MockOturum>;
  ikinciAdim: { kurulu: boolean; yedek: string[] };
  kurumlar: MockKurum[];
  denetim: MockDenetim[];
  mesajlar: MockMesaj[];
  katalog: Record<string, MockSurum[]>;
  ayarlar: MockAyarSurumu[];
  taklitler: MockTaklit[];
  sayac: number;
}

export const ADMIN_ID = '0190a000-0000-7000-8000-000000000001';

/** Belirli bir sayidan sabit bir UUID uretir (mock verisi tekrarlanabilir olsun). */
export function sabitUuid(on: string, n: number): string {
  return `0190a${on}-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
}

/** Mock'ta yeni kimlik. */
export const yeniId = (): string => crypto.randomUUID();

export const simdi = (): string => new Date().toISOString();

const KURUMLAR: Omit<MockKurum, 'moduller' | 'beta' | 'created_at'>[] = (
  [
    ['Ege Işık Dershanesi', 'kurum', 'aktif', '532 111 22 01'],
    ['Bornova Fen Kursu', 'kurum', 'aktif', '532 111 22 02'],
    ['Ayşe Öğretmen', 'bireysel', 'aktif', '532 111 22 03'],
    ['Kuzey Ekip Etüt', 'ekip', 'aktif', '532 111 22 04'],
    ['Marmara Akademi', 'kurum', 'aktif', '532 111 22 05'],
    ['Işıl Matematik Atölyesi', 'ekip', 'aktif', '532 111 22 06'],
    ['Anadolu Hazırlık Merkezi', 'kurum', 'aktif', '532 111 22 07'],
    ['Çınar Dershanesi', 'kurum', 'askida', '532 111 22 08'],
    ['Deniz Kurs Merkezi', 'kurum', 'kapali', '532 111 22 09'],
    ['Yıldız Etüt', 'ekip', 'aktif', '532 111 22 10'],
    ['Atlas Eğitim Kurumları', 'kurum', 'aktif', '532 111 22 11'],
    ['Mavi Kalem Kursu', 'bireysel', 'aktif', '532 111 22 12'],
  ] as const
).map(([ad, tur, durum, tel], i) => {
  const roller: Record<string, number> =
    tur === 'bireysel'
      ? { sahip: 1, ogrenci: 8 }
      : { sahip: 1, yonetici: 1 + (i % 2), ogretmen: 4 + i, ogrenci: 40 + i * 7 };
  return {
    id: sabitUuid('100', i + 1),
    ad,
    tur,
    durum,
    sahip: {
      kullanici_id: sabitUuid('200', i + 1),
      telefon: `+90 ${tel}`,
      eposta: `sahip${String(i + 1)}@ornek.com`,
    },
    roller,
    diger: 2 + (i % 4),
  };
});

function kurumlariUret(): MockKurum[] {
  return KURUMLAR.map((k, i) => ({
    ...k,
    created_at: new Date(Date.UTC(2026, 0, 5 + i * 9, 9, 30)).toISOString(),
    moduller: Object.fromEntries(
      MODUL_KODLARI.map((kod) => [
        kod,
        {
          acik: true,
          ayarVar: kod === 'finans' && i % 3 === 0,
          altKapali: kod === 'odev' && i === 1 ? 2 : 0,
        },
      ]),
    ),
    beta: i % 2 === 0 ? [{ ozellik_kodu: 'yeni-rapor', acik: true, updated_at: simdi() }] : [],
  }));
}

export const TOHUM_AYAR: MockAyar = {
  kurallar: {
    yoklama_geldi: { xp: 20, olay_basi_ust_sinir: null, gec_carpani: 1, aktif: true },
    odev_teslim: { xp: 15, olay_basi_ust_sinir: null, gec_carpani: 0.5, aktif: true },
    odev_onay: { xp: 10, olay_basi_ust_sinir: null, gec_carpani: 1, aktif: true },
    plan_gorevi_tamam: { xp: 5, olay_basi_ust_sinir: null, gec_carpani: 1, aktif: true },
    odak_oturumu: { xp: 1, olay_basi_ust_sinir: null, gec_carpani: 1, aktif: true },
    deneme_girisi: { xp: 10, olay_basi_ust_sinir: null, gec_carpani: 1, aktif: true },
    deneme_net_artisi: { xp: 5, olay_basi_ust_sinir: 50, gec_carpani: 1, aktif: true },
    soru_sorma: { xp: 3, olay_basi_ust_sinir: null, gec_carpani: 1, aktif: true },
    soru_anladim: { xp: 5, olay_basi_ust_sinir: null, gec_carpani: 1, aktif: true },
    geri_bildirim: { xp: 2, olay_basi_ust_sinir: null, gec_carpani: 1, aktif: true },
    kayit_izledi: { xp: 5, olay_basi_ust_sinir: null, gec_carpani: 1, aktif: true },
    haftanin_yildizi: { xp: 50, olay_basi_ust_sinir: null, gec_carpani: 1, aktif: true },
  },
  tavanlar: { genel: 300, plan: 40, odak: 120, soru: 20, kayit: 15 },
};

function konu(
  n: number,
  ad: string,
  brans: string,
  seviye: MockKonu['seviye'],
  ust?: number,
  sinif = 8,
): MockKonu {
  return {
    id: sabitUuid('300', n),
    ad,
    brans_kodu: brans,
    seviye,
    sinif_seviyesi: sinif,
    sira: n,
    ...(ust === undefined ? {} : { ust_id: sabitUuid('300', ust) }),
    yeni: false,
    kapandi: false,
    gecerli_surum_baslangic: 1,
  };
}

function katalogUret(): Record<string, MockSurum[]> {
  const lgs: MockKonu[] = [
    konu(1, 'Sayılar ve İşlemler', 'matematik', 'unite'),
    konu(2, 'Çarpanlar ve Katlar', 'matematik', 'konu', 1),
    konu(3, 'Üslü İfadeler', 'matematik', 'konu', 1),
    konu(4, 'Asal çarpanlara ayırma', 'matematik', 'alt_konu', 2),
    konu(5, 'Cebir', 'matematik', 'unite'),
    konu(6, 'Olasılık', 'matematik', 'konu', 5),
    konu(7, 'Fen: Hücre ve Bölünmeler', 'fen', 'unite'),
    konu(8, 'Mitoz', 'fen', 'konu', 7),
    konu(9, 'Mayoz', 'fen', 'konu', 7),
    konu(10, 'Türkçe: Anlam Bilgisi', 'turkce', 'unite'),
    konu(11, 'Paragraf', 'turkce', 'konu', 10),
  ];
  const tohum = (ad: string, no: number, yayin: boolean): MockSurum => ({
    surum_no: no,
    ad,
    taslak: !yayin,
    ...(yayin ? { yayinlandi_at: '2026-06-01T08:00:00.000Z' } : {}),
    konular: structuredClone(lgs),
    degisiklikler: [],
  });
  return {
    lgs: [tohum('2026-2027 LGS', 1, true)],
    tyt: [tohum('2026-2027 TYT', 1, true)],
    ayt: [tohum('2026-2027 AYT', 1, true)],
    ydt: [],
    okul: [],
  };
}

function durumUret(): MockDurum {
  return {
    oturumlar: new Map(),
    ikinciAdim: { kurulu: false, yedek: [] },
    kurumlar: kurumlariUret(),
    denetim: [],
    mesajlar: [],
    katalog: katalogUret(),
    ayarlar: [
      {
        surum: 1,
        degerler: structuredClone(TOHUM_AYAR),
        onceki_surum: null,
        geri_alinan_surum: null,
        degistiren_kullanici_id: null,
        neden: 'Başlangıç değerleri',
        uyarilar: [],
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    taklitler: [],
    sayac: 0,
  };
}

declare global {
  var __yonetimMock: MockDurum | undefined;
}

export function durum(): MockDurum {
  globalThis.__yonetimMock ??= durumUret();
  return globalThis.__yonetimMock;
}

/** Test yardimcisi: durumu basa alir (oturumlar da silinir). */
export function durumuSifirla(): void {
  globalThis.__yonetimMock = durumUret();
}
