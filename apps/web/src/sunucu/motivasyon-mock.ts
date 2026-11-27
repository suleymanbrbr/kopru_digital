import { MOCK_KURUM_ROLLERI, mockKurumVerisi } from './hesap-mock';
import { mockSimdi } from './mock-zaman';
import type { MockIstek, MockYanit } from './vekil';

/**
 * `NEXT_PUBLIC_API_MOCK=1` iken `/api/motivasyon/*` ucunun bellek ici karsiligi. Yanit sekilleri
 * `@kopru/contracts` motivasyon semalariyla aynidir. Ogrenci: `kurum-atlas`; ogretmen: `kurum-ege`;
 * yonetici: `kurum-mavi` (oyunlastirma modulu KAPALI: her uc `403 modul_kapali`); sahip: `kurum-kuzey`.
 *
 * Ogrenci eylemleri (plan gorevi, odev teslim, soru, geri bildirim, kayit izleme) baska mock'larda
 * yasar; `vekil.ts` bunlar basarili olunca `motivasyonMockXpYaz`i cagirir ve burada XP, gunluk hedef ve
 * seri guncellenir (gercekte bunu olay tuketicisi yapar). Yalniz gelistirme ve e2e icindir; veri sunucu
 * sureci yeniden baslayana kadar bellekte kalir.
 *
 * Gercek servisten bilinen sapma: odak bitirmede `bitis_at` simdiden sonra olabilir (e2e'de saat
 * ileri alinir); gercek servis onu simdiye cekerdi.
 */

type Kayit = Record<string, unknown>;

const uid = () => crypto.randomUUID();
const GUN_MS = 86_400_000;
const hata = (durum: number, kod: string, mesaj: string, details?: unknown): MockYanit => ({
  durum,
  govde: { error: { code: kod, message: mesaj, ...(details === undefined ? {} : { details }) } },
});
const ok = (govde: unknown, durum = 200): MockYanit => ({ durum, govde });

/** Kurum saatiyle (UTC+3) bugun; 04:00 kurali mock'ta yok sayilir. */
const bugunGun = () => new Date(mockSimdi() + 3 * 3_600_000).toISOString().slice(0, 10);
const gunEkle = (tarih: string, gun: number) =>
  new Date(Date.parse(`${tarih}T00:00:00Z`) + gun * GUN_MS).toISOString().slice(0, 10);
const pazartesi = (tarih: string) =>
  gunEkle(tarih, -((new Date(`${tarih}T00:00:00Z`).getUTCDay() + 6) % 7));
const TARIH = /^\d{4}-\d{2}-\d{2}$/;

function nesne(govde: unknown): Kayit {
  return typeof govde === 'object' && govde !== null ? (govde as Kayit) : {};
}

// --- Seviye egrisi (migration tohumunun ilk 30 seviyesi) -------------------------------------

const SEVIYE_ESIKLERI = [
  0, 20, 60, 170, 380, 690, 1070, 1480, 1910, 2360, 2830, 3300, 3520, 3790, 4080, 4380, 4700, 5030,
  5360, 5700, 6050, 6410, 6770, 7130, 7500, 8060, 8730, 9460, 10_230, 11_030,
];
const seviyeOlarak = (xp: number): number => {
  let s = 1;
  for (let i = 0; i < SEVIYE_ESIKLERI.length; i++) if (xp >= (SEVIYE_ESIKLERI[i] ?? 0)) s = i + 1;
  return s;
};

const ASAMALAR = [
  { asama: 1, ad: 'Tohum', gereken_seviye: 1 },
  { asama: 2, ad: 'Yavru', gereken_seviye: 5 },
  { asama: 3, ad: 'Genç', gereken_seviye: 12 },
  { asama: 4, ad: 'Usta', gereken_seviye: 25 },
  { asama: 5, ad: 'Efsane', gereken_seviye: 40 },
];
const asamaOlarak = (seviye: number): number =>
  ASAMALAR.filter((a) => seviye >= a.gereken_seviye).length;
const TURLER = [
  { kod: 'kivilcim', ad: 'Kıvılcım' },
  { kod: 'dinamo', ad: 'Dinamo' },
  { kod: 'sedir', ad: 'Sedir' },
];

const BECERILER = [
  { kod: 'sayisal', ad: 'Sayısal' },
  { kod: 'sozel', ad: 'Sözel' },
  { kod: 'fen', ad: 'Fen' },
  { kod: 'sosyal', ad: 'Sosyal' },
  { kod: 'dil', ad: 'Dil' },
];

// --- Rozetler ---------------------------------------------------------------------------------

interface RozetTanimi {
  kod: string;
  ad: string;
  aciklama: string;
  kategori: string;
  kademe: 'bronz' | 'gumus' | 'altin';
  sayac_kodu: string;
  esik: number;
  gizli: boolean;
}
const ROZETLER: RozetTanimi[] = [
  [
    'seri_bronz',
    'Bir Haftalık Seri',
    '7 gün üst üste çalıştın.',
    'devamlilik',
    'bronz',
    'en_uzun_seri',
    7,
  ],
  [
    'seri_gumus',
    'Bir Aylık Seri',
    '30 gün üst üste çalıştın.',
    'devamlilik',
    'gumus',
    'en_uzun_seri',
    30,
  ],
  [
    'seri_altin',
    'Yüz Günlük Seri',
    '100 gün üst üste çalıştın.',
    'devamlilik',
    'altin',
    'en_uzun_seri',
    100,
  ],
  [
    'aktif_gun_bronz',
    'On Çalışma Günü',
    'Toplam 10 gün çalıştın.',
    'devamlilik',
    'bronz',
    'toplam_aktif_gun',
    10,
  ],
  ['odev_bronz', 'İlk Ödevler', '5 ödev teslim ettin.', 'emek', 'bronz', 'toplam_odev_teslim', 5],
  ['odev_gumus', 'Ödev Düzeni', '25 ödev teslim ettin.', 'emek', 'gumus', 'toplam_odev_teslim', 25],
  [
    'odak_bronz',
    'Beş Saat Odak',
    'Toplam 5 saat odaklandın.',
    'emek',
    'bronz',
    'toplam_odak_dk',
    300,
  ],
  [
    'soru_cozum_bronz',
    'Yüz Soru',
    'Ödevlerinde 100 soru çözdün.',
    'emek',
    'bronz',
    'toplam_cozulen_soru',
    100,
  ],
  [
    'net_bronz',
    'İlk Gelişim',
    'Bir denemede önceki denemelerinden daha iyi yaptın.',
    'gelisim',
    'bronz',
    'net_artisi_deneme',
    1,
  ],
  ['merak_soru_bronz', 'Meraklı', '3 soru sordun.', 'merak', 'bronz', 'toplam_soru', 3],
  ['merak_soru_gumus', 'Soru Avcısı', '15 soru sordun.', 'merak', 'gumus', 'toplam_soru', 15],
  [
    'merak_kayit_bronz',
    'Tekrar İzleyen',
    '3 ders kaydını izledin.',
    'merak',
    'bronz',
    'toplam_kayit_izleme',
    3,
  ],
  [
    'odak_altin',
    'Yüz Saat Odak',
    'Toplam 100 saat odaklandın.',
    'emek',
    'altin',
    'toplam_odak_dk',
    6000,
    true,
  ],
  [
    'yildiz_bronz',
    'Haftanın Yıldızı',
    'Öğretmenin seni haftanın yıldızı seçti.',
    'ozel',
    'bronz',
    'haftanin_yildizi',
    1,
    true,
  ],
].map(([kod, ad, aciklama, kategori, kademe, sayac_kodu, esik, gizli]) => ({
  kod,
  ad,
  aciklama,
  kategori,
  kademe,
  sayac_kodu,
  esik,
  gizli: gizli === true,
})) as RozetTanimi[];

const KOZMETIKLER = [
  ['sapka_kasket', 'sapka', 'Kasket', 'yaygin', { seri: 3 }],
  ['gozluk_yuvarlak', 'gozluk', 'Yuvarlak Gözlük', 'yaygin', { seri: 7 }],
  ['aksesuar_atki', 'aksesuar', 'Atkı', 'nadir', { seri: 14 }],
  ['arka_plan_gece', 'arka_plan', 'Gece Gökyüzü', 'nadir', { seri: 30 }],
  ['cerceve_gumus', 'cerceve', 'Gümüş Çerçeve', 'nadir', { seri: 60 }],
  ['sapka_tac', 'sapka', 'Taç', 'efsanevi', { seri: 100 }],
  [
    'aksesuar_kitap',
    'aksesuar',
    'Kitap',
    'yaygin',
    { rozet: 'odev_bronz', rozet_adi: 'İlk Ödevler' },
  ],
  [
    'gozluk_bilgin',
    'gozluk',
    'Bilgin Gözlüğü',
    'nadir',
    { rozet: 'merak_soru_gumus', rozet_adi: 'Soru Avcısı' },
  ],
  ['arka_plan_orman', 'arka_plan', 'Orman', 'yaygin', { seviye: 5 }],
  ['sapka_mezuniyet', 'sapka', 'Mezuniyet Şapkası', 'nadir', { seviye: 10 }],
] as const;

// --- Durum ------------------------------------------------------------------------------------

interface Oturum {
  id: string;
  istemci_id: string;
  baslangic_at: string;
  bitis_at: string | null;
  planlanan_dk: number;
  gerceklesen_sn: number;
  durum: 'devam' | 'tamam' | 'yarida';
  brans_kodu: string | null;
  plan_gorev_id: string | null;
  cihaz: string | null;
}
interface Hareket {
  id: string;
  kural_kodu: string;
  xp: number;
  gun: string;
  kismi: boolean;
  created_at: string;
}
interface Yildiz {
  id: string;
  ogrenci_id: string;
  veren_ogretmen_id: string;
  grup_id: string;
  hafta_baslangic: string;
  gerekce: string | null;
  created_at: string;
}
interface Duraklatma {
  id: string;
  grup_id: string;
  veren_ogretmen_id: string;
  baslangic_gun: string;
  bitis_gun: string;
  neden: string | null;
  iptal_at: string | null;
  created_at: string;
}
interface Karakter {
  tur_kodu: string;
  ad: string;
  secildi_at: string;
  tur_hakki: number;
  kusanilan: Record<string, string>;
}
type GunDurumu = 'aktif' | 'dondurma' | 'duraklatma' | 'onarim' | 'kacirildi' | 'yok';

interface KurumDurumu {
  toplamXp: number;
  bugunXp: number;
  buHaftaXp: number;
  beceriler: Record<string, number>;
  karakter: Karakter | null;
  /** 35 gun: eskiden yeniye; son eleman bugun. */
  gunler: GunDurumu[];
  gunTarihi: string;
  mevcutSeri: number;
  enUzunSeri: number;
  hedefler: { plan_gorevi: number; odak_dk: number; odev: number; soru: number };
  sayaclar: Record<string, number>;
  odakAcik: Oturum | null;
  odakGecmisi: Oturum[];
  hareketler: Hareket[];
  aldigiYildizlar: Yildiz[];
  verilenYildizlar: Yildiz[];
  duraklatmalar: Record<string, Duraklatma[]>;
}

const ESIKLER = { plan_gorevi: 1, odak_dk: 20, odev: 1, soru: 1 } as const;
const GUN_SAYISI = 35;

const kutu = globalThis as unknown as { __kopruMotivasyonMock?: Record<string, KurumDurumu> };
const depo = () => (kutu.__kopruMotivasyonMock ??= {});

export function motivasyonMockSifirla(): void {
  kutu.__kopruMotivasyonMock = undefined;
}

function gunlerKur(): GunDurumu[] {
  // 6 gun kayit yok; 8 aktif; 1 bos gun; 6 aktif; 3 ogretmen arasi; 2 aktif; 1 dondurma; 7 aktif; bugun.
  const parcalar: [GunDurumu, number][] = [
    ['yok', 6],
    ['aktif', 8],
    ['kacirildi', 1],
    ['aktif', 6],
    ['duraklatma', 3],
    ['aktif', 2],
    ['dondurma', 1],
    ['aktif', 7],
    ['yok', 1],
  ];
  return parcalar.flatMap(([d, n]) => Array.from({ length: n }, () => d));
}

function kurumKur(): KurumDurumu {
  const g = bugunGun();
  return {
    toplamXp: 1470,
    bugunXp: 20,
    buHaftaXp: 85,
    beceriler: { sayisal: 420, sozel: 260, fen: 310, sosyal: 90, dil: 150 },
    karakter: null,
    gunler: gunlerKur(),
    gunTarihi: g,
    mevcutSeri: 15,
    enUzunSeri: 23,
    hedefler: { plan_gorevi: 0, odak_dk: 8, odev: 0, soru: 0 },
    sayaclar: {
      en_uzun_seri: 23,
      toplam_aktif_gun: 24,
      toplam_odev_teslim: 12,
      toplam_odak_dk: 120,
      toplam_cozulen_soru: 64,
      net_artisi_deneme: 0,
      toplam_soru: 4,
      toplam_kayit_izleme: 1,
      haftanin_yildizi: 0,
    },
    odakAcik: null,
    odakGecmisi: [],
    hareketler: [
      hareket('yoklama_geldi', 20, 0),
      hareket('odev_teslim', 15, 1),
      hareket('plan_gorevi_tamam', 5, 1),
      hareket('odak_oturumu', 25, 2),
      hareket('soru_sorma', 3, 3),
    ],
    aldigiYildizlar: [],
    verilenYildizlar: [],
    duraklatmalar: {},
  };
}

function hareket(kural: string, xp: number, gunOnce: number): Hareket {
  return {
    id: uid(),
    kural_kodu: kural,
    xp,
    gun: gunEkle(bugunGun(), -gunOnce),
    kismi: false,
    created_at: new Date(mockSimdi() - gunOnce * GUN_MS - 3_600_000).toISOString(),
  };
}

/** Gun degistiyse takvimi bir kayiktirir (mock'ta 04:00 kurali yok; gece yarisi donusu). */
function gunuYuvarla(d: KurumDurumu): void {
  const bugun = bugunGun();
  const fark = Math.round((Date.parse(bugun) - Date.parse(d.gunTarihi)) / GUN_MS);
  if (fark <= 0) return;
  for (let i = 0; i < Math.min(fark, GUN_SAYISI); i++) {
    d.gunler.push(i === fark - 1 ? 'yok' : 'kacirildi');
    d.gunler.shift();
  }
  d.gunTarihi = bugun;
  d.bugunXp = 0;
  d.hedefler = { plan_gorevi: 0, odak_dk: 0, odev: 0, soru: 0 };
}

/**
 * E2E yalitimi: `mock_motivasyon` cerezi (yalniz mock modunda okunur) bir durum anahtari tasir; bu
 * anahtarli istekler kendi kurum durumlarini gorur, diger spec'lerin XP/karakter eylemleri onlari
 * etkilemez. Cerez yoksa varsayilan (ortak) durum. Giris noktalari anahtari senkron ayarlar.
 */
const ANAHTAR = /^[a-z0-9]{1,32}$/;
export const motivasyonAnahtariOku = (cerez: string | undefined): string | undefined =>
  cerez !== undefined && ANAHTAR.test(cerez) ? cerez : undefined;
let gecerliAnahtar = '';

const kurum = (kurumId: string): KurumDurumu => {
  const d = (depo()[`${gecerliAnahtar}|${kurumId}`] ??= kurumKur());
  gunuYuvarla(d);
  return d;
};

// --- Turetilmis okumalar ----------------------------------------------------------------------

function bugunAktifMi(d: KurumDurumu): boolean {
  return d.gunler[GUN_SAYISI - 1] === 'aktif';
}

function hedefListesi(d: KurumDurumu) {
  return (['plan_gorevi', 'odak_dk', 'odev', 'soru'] as const).map((tur) => {
    const esik = ESIKLER[tur];
    const yapilan = d.hedefler[tur];
    return { tur, yapilan, esik, kalan: Math.max(0, esik - yapilan) };
  });
}

function kazanilanRozetler(d: KurumDurumu) {
  return ROZETLER.filter((r) => (d.sayaclar[r.sayac_kodu] ?? 0) >= r.esik);
}

function karakterOzeti(d: KurumDurumu, seviye: number) {
  if (!d.karakter) return null;
  const asama = asamaOlarak(seviye);
  const sonraki = ASAMALAR.find((a) => a.asama === asama + 1);
  return {
    tur_kodu: d.karakter.tur_kodu,
    ad: d.karakter.ad,
    asama,
    sonraki_asama_seviyesi: sonraki?.gereken_seviye ?? null,
    kusanilanlar: Object.entries(d.karakter.kusanilan).map(([slot, kozmetik_kodu]) => ({
      slot,
      kozmetik_kodu,
    })),
  };
}

function durumGovdesi(d: KurumDurumu, ogrenciId: string) {
  const seviye = seviyeOlarak(d.toplamXp);
  const baslangic = SEVIYE_ESIKLERI[seviye - 1] ?? 0;
  const sonraki = SEVIYE_ESIKLERI[seviye] ?? null;
  const kazanilan = kazanilanRozetler(d);
  const kazanildi = new Set(kazanilan.map((r) => r.kod));
  return {
    ogrenci_id: ogrenciId,
    toplam_xp: d.toplamXp,
    seviye,
    seviye_baslangic_xp: baslangic,
    sonraki_seviye_xp: sonraki,
    sonraki_seviyeye_kalan: sonraki === null ? null : sonraki - d.toplamXp,
    bu_hafta_xp: d.buHaftaXp,
    bugun: {
      gun: d.gunTarihi,
      xp: d.bugunXp,
      tavanlar: [
        { kod: 'genel', kullanilan: Math.min(d.bugunXp, 300), ust_sinir: 300 },
        { kod: 'odak', kullanilan: Math.min(d.hedefler.odak_dk, 120), ust_sinir: 120 },
      ],
    },
    beceriler: BECERILER.map((b) => ({ ...b, puan: d.beceriler[b.kod] ?? 0 })),
    rozetler: {
      kazanilan: kazanilan.map((r) => ({
        kod: r.kod,
        ad: r.ad,
        aciklama: r.aciklama,
        kategori: r.kategori,
        kademe: r.kademe,
        kazanildi_at: new Date(mockSimdi() - 6 * GUN_MS).toISOString(),
      })),
      // Gizli rozetler kazanilana kadar listelenmez.
      kilitli: ROZETLER.filter((r) => !kazanildi.has(r.kod) && !r.gizli).map((r) => ({
        kod: r.kod,
        ad: r.ad,
        aciklama: r.aciklama,
        kategori: r.kategori,
        kademe: r.kademe,
        sayac_kodu: r.sayac_kodu,
        ilerleme: Math.min(d.sayaclar[r.sayac_kodu] ?? 0, r.esik - 1),
        esik: r.esik,
      })),
    },
    karakter: karakterOzeti(d, seviye),
    seri: {
      mevcut_seri: d.mevcutSeri,
      en_uzun_seri: d.enUzunSeri,
      son_aktif_gun: gunEkle(d.gunTarihi, bugunAktifMi(d) ? 0 : -1),
      dondurma_stogu: 1,
      onarim_hakki: 1,
      bozulan_seri: null,
      bozulan_gun: null,
      onarim_bitis_at: null,
    },
    son_hareketler: [...d.hareketler].slice(0, 10),
  };
}

function seriGovdesi(d: KurumDurumu) {
  const bugun = d.gunTarihi;
  const aktif = bugunAktifMi(d);
  const sirada = [7, 14, 30, 60, 100].find((t) => t > d.mevcutSeri) ?? null;
  return {
    bugun,
    mevcut_seri: d.mevcutSeri,
    en_uzun_seri: d.enUzunSeri,
    dondurma_stogu: 1,
    onarim_hakki: 1,
    bugun_aktif: aktif,
    hedefler: hedefListesi(d),
    onarim: null,
    sonraki_kilometre_tasi:
      sirada === null ? null : { hedef: sirada, kalan: sirada - d.mevcutSeri },
    gunler: d.gunler.map((durum, i) => ({
      gun: gunEkle(bugun, i - (GUN_SAYISI - 1)),
      durum,
      bugun: i === GUN_SAYISI - 1,
    })),
  };
}

// --- XP yazma (olay tuketicisinin yerine) -----------------------------------------------------

function xpYaz(d: KurumDurumu, kural: string, xp: number, beceri?: string): void {
  d.toplamXp += xp;
  d.bugunXp += xp;
  d.buHaftaXp += xp;
  if (beceri) d.beceriler[beceri] = (d.beceriler[beceri] ?? 0) + xp;
  d.hareketler.unshift({
    id: uid(),
    kural_kodu: kural,
    xp,
    gun: d.gunTarihi,
    kismi: false,
    created_at: new Date(mockSimdi()).toISOString(),
  });
  d.hareketler.length = Math.min(d.hareketler.length, 20);
}

function gunuTamamla(d: KurumDurumu): void {
  if (bugunAktifMi(d)) return;
  if (!hedefListesi(d).some((h) => h.kalan === 0)) return;
  d.gunler[GUN_SAYISI - 1] = 'aktif';
  d.mevcutSeri += 1;
  d.enUzunSeri = Math.max(d.enUzunSeri, d.mevcutSeri);
  d.sayaclar.en_uzun_seri = d.enUzunSeri;
  d.sayaclar.toplam_aktif_gun = (d.sayaclar.toplam_aktif_gun ?? 0) + 1;
}

const XP_KURALLARI = [
  {
    servis: 'ogrenme',
    yontem: 'PUT',
    desen: /\/gorevler\/[^/]+\/gerceklesen$/,
    kural: 'plan_gorevi_tamam',
    xp: 5,
    hedef: 'plan_gorevi',
    sayac: null,
    beceri: 'sayisal',
  },
  {
    servis: 'ogrenme',
    yontem: 'POST',
    desen: /\/ogrenci-odevleri\/[^/]+\/teslim$/,
    kural: 'odev_teslim',
    xp: 15,
    hedef: 'odev',
    sayac: 'toplam_odev_teslim',
    beceri: 'sozel',
  },
  {
    servis: 'ogrenme',
    yontem: 'POST',
    desen: /\/sorular$/,
    kural: 'soru_sorma',
    xp: 3,
    hedef: null,
    sayac: 'toplam_soru',
    beceri: 'fen',
  },
  {
    servis: 'ogrenme',
    yontem: 'POST',
    desen: /\/sorular\/[^/]+\/anladim$/,
    kural: 'soru_anladim',
    xp: 5,
    hedef: 'soru',
    sayac: null,
    beceri: 'fen',
  },
  {
    servis: 'ders',
    yontem: 'PUT',
    desen: /\/dersler\/[^/]+\/geri-bildirim$/,
    kural: 'geri_bildirim',
    xp: 2,
    hedef: null,
    sayac: null,
    beceri: null,
  },
  {
    servis: 'ders',
    yontem: 'POST',
    desen: /\/kayitlarim\/[^/]+\/izledim$/,
    kural: 'kayit_izledi',
    xp: 5,
    hedef: null,
    sayac: 'toplam_kayit_izleme',
    beceri: null,
  },
] as const;

/**
 * Baska bir mock'un basarili ogrenci eylemi: ilgili XP kuralini isletir. Yalniz ogrenci kurumunda ve
 * modul aciksa; eslesmeyen istekte bir sey yapmaz.
 */
export function motivasyonMockXpYaz(
  servis: string,
  yontem: string,
  yol: string,
  anahtar?: string,
): void {
  gecerliAnahtar = anahtar ?? '';
  const m = /^kurumlar\/([^/]+)\//.exec(yol);
  const kurumId = m?.[1];
  if (!kurumId || MOCK_KURUM_ROLLERI[kurumId] !== 'ogrenci' || kapaliMi(kurumId)) return;
  const kural = XP_KURALLARI.find(
    (k) => k.servis === servis && k.yontem === yontem.toUpperCase() && k.desen.test(yol),
  );
  if (!kural) return;
  const d = kurum(kurumId);
  xpYaz(d, kural.kural, kural.xp, kural.beceri ?? undefined);
  if (kural.hedef) d.hedefler[kural.hedef] += 1;
  if (kural.sayac) d.sayaclar[kural.sayac] = (d.sayaclar[kural.sayac] ?? 0) + 1;
  gunuTamamla(d);
}

// --- Yetki ------------------------------------------------------------------------------------

/** Oyunlastirma modulu kapali deneme kurumlari (`kimlik/mock.ts` ile ayni). */
const MODUL_KAPALI = new Set(['kurum-mavi']);
const kapaliMi = (kurumId: string) => MODUL_KAPALI.has(kurumId);
const rolu = (kurumId: string) => MOCK_KURUM_ROLLERI[kurumId] ?? 'ogretmen';
const izinYok = () => hata(403, 'izin_yok', 'Bu işlem için yetkin yok.');
const bulunamadi = () => hata(404, 'bulunamadi', 'Kaynak bulunamadı.');

function benId(kurumId: string): string {
  const { uyeler } = mockKurumVerisi(kurumId);
  return uyeler.filter((u) => u.rol === 'ogrenci')[1]?.uyelik_id ?? uid();
}

// --- Karakter ---------------------------------------------------------------------------------

/** Mock'taki yasakli sozcuk suzgeci: gercek servisteki liste daha genistir. */
const YASAKLI = ['amk', 'aq', 'sik', 'orospu', 'hitler', 'nazi', 'fuck', 'shit'];
function adGecerli(ad: string): 'ok' | 'bicim' | 'yasakli' {
  if (!/^[\p{L}\p{N} ]{1,24}$/u.test(ad)) return 'bicim';
  const duz = ad.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g');
  return YASAKLI.some((y) => duz.includes(y)) ? 'yasakli' : 'ok';
}

function karakterDetayi(d: KurumDurumu) {
  const c = d.karakter;
  if (!c) return null;
  const seviye = seviyeOlarak(d.toplamXp);
  const asama = asamaOlarak(seviye);
  const sonraki = ASAMALAR.find((a) => a.asama === asama + 1);
  return {
    tur_kodu: c.tur_kodu,
    tur_adi: TURLER.find((t) => t.kod === c.tur_kodu)?.ad ?? c.tur_kodu,
    ad: c.ad,
    asama,
    asama_adi: ASAMALAR[asama - 1]?.ad ?? '',
    sonraki_asama_seviyesi: sonraki?.gereken_seviye ?? null,
    tur_degistirme_hakki: c.tur_hakki,
    secildi_at: c.secildi_at,
    kusanilanlar: Object.entries(c.kusanilan).map(([slot, kozmetik_kodu]) => ({
      slot,
      kozmetik_kodu,
    })),
  };
}

function kozmetikSahibiMi(d: KurumDurumu, kosul: Record<string, unknown>): boolean {
  const seviye = seviyeOlarak(d.toplamXp);
  if (typeof kosul.seri === 'number') return d.enUzunSeri >= kosul.seri;
  if (typeof kosul.seviye === 'number') return seviye >= kosul.seviye;
  if (typeof kosul.rozet === 'string') {
    return kazanilanRozetler(d).some((r) => r.kod === kosul.rozet);
  }
  return false;
}

function karakterIstegi(d: KurumDurumu, yontem: string, alt: string, govde: unknown): MockYanit {
  const g = nesne(govde);
  if (alt === 'turler' && yontem === 'GET') {
    return ok({
      turler: TURLER.map((t) => ({ ...t, asamalar: ASAMALAR })),
    });
  }
  if (alt === 'kozmetikler' && yontem === 'GET') {
    return ok({
      kozmetikler: KOZMETIKLER.map(([kod, slot, ad, nadirlik, kosul]) => {
        const sahip = kozmetikSahibiMi(d, kosul);
        return {
          kod,
          slot,
          ad,
          nadirlik,
          sahip,
          acildi_at: sahip ? new Date(mockSimdi() - 5 * GUN_MS).toISOString() : null,
          kusanildi: d.karakter?.kusanilan[slot] === kod,
          acilma_kosulu: kosul,
        };
      }),
    });
  }
  if (alt === '') {
    if (yontem === 'GET') return ok({ karakter: karakterDetayi(d) });
    if (yontem === 'POST') {
      if (d.karakter) {
        return hata(409, 'karakter_zaten_secildi', 'Karakterini zaten seçtin.');
      }
      const tur = typeof g.tur_kodu === 'string' ? g.tur_kodu : '';
      const ad = typeof g.ad === 'string' ? g.ad.trim() : '';
      if (!TURLER.some((t) => t.kod === tur)) {
        return hata(422, 'karakter_turu_gecersiz', 'Karakter türü geçersiz.');
      }
      if (ad.length === 0 || ad.length > 24)
        return hata(400, 'dogrulama_hatasi', 'İstek geçersiz.');
      if (adGecerli(ad) !== 'ok') {
        return hata(422, 'karakter_adi_uygunsuz', 'Bu ad kullanılamaz.');
      }
      d.karakter = {
        tur_kodu: tur,
        ad,
        secildi_at: new Date(mockSimdi()).toISOString(),
        tur_hakki: 1,
        kusanilan: {},
      };
      return ok({ karakter: karakterDetayi(d) }, 201);
    }
  }
  if (!d.karakter) return hata(422, 'karakter_secilmemis', 'Önce bir karakter seç.');
  if (alt === 'tur' && yontem === 'PATCH') {
    const tur = typeof g.tur_kodu === 'string' ? g.tur_kodu : '';
    if (!TURLER.some((t) => t.kod === tur)) {
      return hata(422, 'karakter_turu_gecersiz', 'Karakter türü geçersiz.');
    }
    if (tur === d.karakter.tur_kodu) return hata(409, 'ayni_tur', 'Bu zaten karakterinin türü.');
    if (d.karakter.tur_hakki < 1) {
      return hata(409, 'tur_degistirme_hakki_yok', 'Türü değiştirme hakkını kullandın.');
    }
    d.karakter.tur_kodu = tur;
    d.karakter.tur_hakki = 0;
    return ok({ karakter: karakterDetayi(d) });
  }
  if (alt === 'ad' && yontem === 'PATCH') {
    const ad = typeof g.ad === 'string' ? g.ad.trim() : '';
    if (ad.length === 0 || ad.length > 24) return hata(400, 'dogrulama_hatasi', 'İstek geçersiz.');
    if (adGecerli(ad) !== 'ok') return hata(422, 'karakter_adi_uygunsuz', 'Bu ad kullanılamaz.');
    d.karakter.ad = ad;
    return ok({ karakter: karakterDetayi(d) });
  }
  const slot = /^kusanimlar\/([^/]+)$/.exec(alt)?.[1];
  if (slot && yontem === 'PUT') {
    const kod = typeof g.kozmetik_kodu === 'string' ? g.kozmetik_kodu : '';
    const k = KOZMETIKLER.find((x) => x[0] === kod);
    if (!k || !kozmetikSahibiMi(d, k[4])) {
      return hata(422, 'kozmetik_sahip_degil', 'Bu kozmetik henüz senin değil.');
    }
    if (k[1] !== slot)
      return hata(422, 'kozmetik_slot_uyusmuyor', 'Bu kozmetik o yuvaya takılmaz.');
    d.karakter.kusanilan[slot] = kod;
    return ok({ karakter: karakterDetayi(d) });
  }
  if (slot && yontem === 'DELETE') {
    Reflect.deleteProperty(d.karakter.kusanilan, slot);
    return ok({ karakter: karakterDetayi(d) });
  }
  return bulunamadi();
}

// --- Odak -------------------------------------------------------------------------------------

function odakIstegi(d: KurumDurumu, yontem: string, alt: string, govde: unknown): MockYanit {
  const g = nesne(govde);
  if (alt === 'acik' && yontem === 'GET') return ok({ oturum: d.odakAcik });
  if (alt === '' && yontem === 'GET') return ok({ oturumlar: d.odakGecmisi.slice(0, 20) });
  if (alt === '' && yontem === 'POST') {
    const istemciId = typeof g.istemci_id === 'string' ? g.istemci_id : '';
    const mod = g.mod;
    if (
      !/^[0-9a-f-]{36}$/i.test(istemciId) ||
      !['25_5', '50_10', 'serbest'].includes(String(mod))
    ) {
      return hata(400, 'dogrulama_hatasi', 'İstek geçersiz.');
    }
    const sabit = mod === '25_5' ? 25 : mod === '50_10' ? 50 : null;
    const dk = sabit ?? (typeof g.planlanan_dk === 'number' ? g.planlanan_dk : NaN);
    if (!Number.isInteger(dk) || dk < 5 || dk > 180) {
      return hata(400, 'dogrulama_hatasi', 'İstek geçersiz.');
    }
    const mevcut = [d.odakAcik, ...d.odakGecmisi].find((o) => o?.istemci_id === istemciId);
    if (mevcut) return ok(mevcut);
    if (d.odakAcik) {
      return hata(409, 'acik_oturum_var', 'Devam eden bir odak oturumun var.', {
        oturum: d.odakAcik,
      });
    }
    const oturum: Oturum = {
      id: uid(),
      istemci_id: istemciId,
      baslangic_at:
        typeof g.baslangic_at === 'string' ? g.baslangic_at : new Date(mockSimdi()).toISOString(),
      bitis_at: null,
      planlanan_dk: dk,
      gerceklesen_sn: 0,
      durum: 'devam',
      brans_kodu: typeof g.brans_kodu === 'string' ? g.brans_kodu : null,
      plan_gorev_id: typeof g.plan_gorev_id === 'string' ? g.plan_gorev_id : null,
      cihaz: typeof g.cihaz === 'string' ? g.cihaz : null,
    };
    d.odakAcik = oturum;
    return ok(oturum, 201);
  }
  const bitir = /^([^/]+)\/bitir$/.exec(alt);
  if (bitir?.[1] && yontem === 'POST') {
    const oturum = [d.odakAcik, ...d.odakGecmisi].find((o) => o?.istemci_id === bitir[1]);
    if (!oturum) return hata(404, 'bulunamadi', 'Odak oturumu bulunamadı.');
    const durum = g.durum === 'tamam' || g.durum === 'yarida' ? g.durum : null;
    if (!durum) return hata(400, 'dogrulama_hatasi', 'İstek geçersiz.');
    if (oturum.durum !== 'devam') {
      return ok({
        oturum,
        kazanim: {
          xp: Math.floor(oturum.gerceklesen_sn / 60),
          seviye_atladi: false,
          yeni_rozetler: [],
          dogrulanmamis_sayilan_sn: 0,
          dogrulanmamis_sayilmayan_sn: 0,
        },
      });
    }
    const baslangic = Date.parse(oturum.baslangic_at);
    const bitis = typeof g.bitis_at === 'string' ? Date.parse(g.bitis_at) : mockSimdi();
    const sn = Math.max(
      0,
      Math.min(Math.floor((bitis - baslangic) / 1000), oturum.planlanan_dk * 60 + 60, 3 * 3600),
    );
    oturum.durum = durum;
    oturum.bitis_at = new Date(Math.max(bitis, baslangic)).toISOString();
    oturum.gerceklesen_sn = sn;
    d.odakAcik = null;
    d.odakGecmisi.unshift(oturum);
    const xp = Math.floor(sn / 60);
    const once = seviyeOlarak(d.toplamXp);
    if (xp > 0) {
      xpYaz(d, 'odak_oturumu', xp, 'sayisal');
      d.hedefler.odak_dk += xp;
      d.sayaclar.toplam_odak_dk = (d.sayaclar.toplam_odak_dk ?? 0) + xp;
      gunuTamamla(d);
    }
    return ok({
      oturum,
      kazanim: {
        xp,
        seviye_atladi: seviyeOlarak(d.toplamXp) > once,
        yeni_rozetler: [],
        dogrulanmamis_sayilan_sn: 0,
        dogrulanmamis_sayilmayan_sn: 0,
      },
    });
  }
  return bulunamadi();
}

// --- Ogretmen: ozet, yildiz, duraklatma -------------------------------------------------------

/** Ogrenci kimliginden deterministik, kurum durumundan bagimsiz bir ozet (ogretmen gorunumu). */
function ogrenciOzeti(kurumId: string, ogrenciId: string): MockYanit {
  const { uyeler } = mockKurumVerisi(kurumId);
  if (!uyeler.some((u) => u.uyelik_id === ogrenciId && u.rol === 'ogrenci')) return bulunamadi();
  let h = 0;
  for (const c of ogrenciId) h = (h * 31 + c.charCodeAt(0)) % 9973;
  const d = kurumKur();
  d.toplamXp = 150 + (h % 40) * 90;
  d.bugunXp = h % 35;
  d.buHaftaXp = 30 + (h % 12) * 12;
  d.beceriler = {
    sayisal: 60 + (h % 17) * 25,
    sozel: 40 + (h % 11) * 30,
    fen: 80 + (h % 13) * 20,
    sosyal: 20 + (h % 7) * 35,
    dil: 30 + (h % 5) * 40,
  };
  d.mevcutSeri = h % 20;
  d.enUzunSeri = d.mevcutSeri + (h % 9);
  d.sayaclar.en_uzun_seri = d.enUzunSeri;
  d.karakter = {
    tur_kodu: TURLER[h % 3]?.kod ?? 'kivilcim',
    ad: 'Yoldaş',
    secildi_at: new Date(mockSimdi()).toISOString(),
    tur_hakki: 1,
    kusanilan: {},
  };
  return ok(durumGovdesi(d, ogrenciId));
}

function ogretmenKimligi(kurumId: string): string {
  return mockKurumVerisi(kurumId).uyeler.find((u) => u.rol === 'ogretmen')?.uyelik_id ?? uid();
}

const YILDIZ_LIMITI = 3;

function yildizIstegi(
  kurumId: string,
  d: KurumDurumu,
  yontem: string,
  alt: string,
  govde: unknown,
): MockYanit {
  const rol = rolu(kurumId);
  const hafta = pazartesi(bugunGun());
  const limit = rol === 'ogretmen' ? YILDIZ_LIMITI : null;
  const buHafta = d.verilenYildizlar.filter((y) => y.hafta_baslangic === hafta);
  if (alt === 'verdiklerim' && yontem === 'GET') {
    return ok({
      hafta_baslangic: hafta,
      limit,
      verilen: buHafta.length,
      kalan: limit === null ? null : Math.max(0, limit - buHafta.length),
      yildizlar: buHafta,
    });
  }
  if (alt === '' && yontem === 'POST') {
    const g = nesne(govde);
    const ogrenciId = typeof g.ogrenci_id === 'string' ? g.ogrenci_id : '';
    const grupId = typeof g.grup_id === 'string' ? g.grup_id : '';
    const gerekce = typeof g.gerekce === 'string' && g.gerekce.trim() ? g.gerekce.trim() : null;
    if (!ogrenciId || !grupId || (gerekce !== null && gerekce.length > 200)) {
      return hata(400, 'dogrulama_hatasi', 'İstek geçersiz.');
    }
    const { grupUyeleri } = mockKurumVerisi(kurumId);
    const uye = (grupUyeleri[grupId] ?? []).some(
      (u) => u.ogrenci_id === ogrenciId && u.bitis_tarihi === null,
    );
    if (!uye) return bulunamadi();
    if (buHafta.some((y) => y.ogrenci_id === ogrenciId)) {
      return hata(
        409,
        'haftanin_yildizi_verilmis',
        'Bu öğrenci bu hafta zaten haftanın yıldızı seçildi.',
      );
    }
    if (limit !== null && buHafta.length >= limit) {
      return hata(
        409,
        'haftalik_limit_asildi',
        'Bu hafta verebileceğin haftanın yıldızı hakkını kullandın.',
      );
    }
    const yildiz: Yildiz = {
      id: uid(),
      ogrenci_id: ogrenciId,
      veren_ogretmen_id: ogretmenKimligi(kurumId),
      grup_id: grupId,
      hafta_baslangic: hafta,
      gerekce,
      created_at: new Date(mockSimdi()).toISOString(),
    };
    d.verilenYildizlar.push(yildiz);
    d.aldigiYildizlar.push(yildiz);
    return ok({ yildiz, xp: 50, yeni_rozetler: [] }, 201);
  }
  return bulunamadi();
}

function aldigiYildizlar(kurumId: string, ogrenciId: string): MockYanit {
  const d = kurum(kurumId);
  const eski: Yildiz = {
    id: uid(),
    ogrenci_id: ogrenciId.length === 36 ? ogrenciId : benId(kurumId),
    veren_ogretmen_id: ogretmenKimligi(kurumId),
    grup_id: uid(),
    hafta_baslangic: pazartesi(gunEkle(bugunGun(), -21)),
    gerekce: 'Bu ay her derse hazırlıklı geldi.',
    created_at: new Date(mockSimdi() - 21 * GUN_MS).toISOString(),
  };
  return ok({
    yildizlar: [...d.aldigiYildizlar.filter((y) => y.ogrenci_id === ogrenciId), eski],
  });
}

function duraklatmaIstegi(
  kurumId: string,
  d: KurumDurumu,
  yontem: string,
  grupId: string,
  duraklatmaId: string | undefined,
  govde: unknown,
): MockYanit {
  if (!mockKurumVerisi(kurumId).gruplar.some((g) => g.id === grupId)) return bulunamadi();
  const liste = (d.duraklatmalar[grupId] ??= []);
  if (yontem === 'GET' && !duraklatmaId) {
    return ok({
      duraklatmalar: [...liste].sort((a, b) => b.baslangic_gun.localeCompare(a.baslangic_gun)),
    });
  }
  if (yontem === 'DELETE' && duraklatmaId) {
    const k = liste.find((x) => x.id === duraklatmaId && x.iptal_at === null);
    if (!k) return hata(404, 'bulunamadi', 'Duraklatma bulunamadı.');
    k.iptal_at = new Date(mockSimdi()).toISOString();
    return { durum: 204 };
  }
  if (yontem === 'POST' && !duraklatmaId) {
    const g = nesne(govde);
    const bas = typeof g.baslangic_gun === 'string' ? g.baslangic_gun : '';
    const bit = typeof g.bitis_gun === 'string' ? g.bitis_gun : '';
    const neden = typeof g.neden === 'string' && g.neden.trim() ? g.neden.trim() : null;
    if (!TARIH.test(bas) || !TARIH.test(bit) || bit < bas || (neden && neden.length > 200)) {
      return hata(400, 'dogrulama_hatasi', 'İstek geçersiz.');
    }
    const gun = (Date.parse(bit) - Date.parse(bas)) / GUN_MS;
    if (gun > 30) return hata(422, 'validation_error', 'Duraklatma en çok 31 gün olabilir.');
    if (bas < bugunGun()) {
      return hata(422, 'validation_error', 'Duraklatma geçmiş bir günle başlayamaz.');
    }
    if (liste.some((x) => x.iptal_at === null && x.baslangic_gun <= bit && x.bitis_gun >= bas)) {
      return hata(409, 'conflict', 'Bu tarihlerde grup için zaten bir duraklatma var.');
    }
    const yeni: Duraklatma = {
      id: uid(),
      grup_id: grupId,
      veren_ogretmen_id: ogretmenKimligi(kurumId),
      baslangic_gun: bas,
      bitis_gun: bit,
      neden,
      iptal_at: null,
      created_at: new Date(mockSimdi()).toISOString(),
    };
    liste.push(yeni);
    return ok(yeni, 201);
  }
  return bulunamadi();
}

// --- Ana yonlendirici -------------------------------------------------------------------------

export function motivasyonMock(istek: MockIstek): MockYanit {
  gecerliAnahtar = istek.motivasyonAnahtari ?? '';
  const m = /^kurumlar\/([^/]+)\/(.*)$/.exec(istek.yol);
  const kurumId = m?.[1];
  const alt = m?.[2];
  if (!kurumId || alt === undefined) return bulunamadi();
  if (kapaliMi(kurumId)) return hata(403, 'modul_kapali', 'Bu özellik kurumunuzda kapalı.');
  const rol = rolu(kurumId);
  const ogrenci = rol === 'ogrenci';
  const d = kurum(kurumId);

  // Ogrenci
  if (alt === 'benim' && istek.yontem === 'GET') {
    return ogrenci ? ok(durumGovdesi(d, benId(kurumId))) : izinYok();
  }
  if (alt === 'benim/seri' && istek.yontem === 'GET')
    return ogrenci ? ok(seriGovdesi(d)) : izinYok();
  if (alt === 'karakter' || alt.startsWith('karakter/')) {
    return ogrenci
      ? karakterIstegi(
          d,
          istek.yontem,
          alt.slice('karakter'.length).replace(/^\//, ''),
          istek.govde,
        )
      : izinYok();
  }
  if (alt === 'odak-oturumlari' || alt.startsWith('odak-oturumlari/')) {
    return ogrenci
      ? odakIstegi(
          d,
          istek.yontem,
          alt.slice('odak-oturumlari'.length).replace(/^\//, ''),
          istek.govde,
        )
      : izinYok();
  }

  // Ogrenci ya da ogretmen: ogrencinin aldigi yildizlar
  const ogr = /^ogrenciler\/([^/]+)\/(ozet|haftanin-yildizlari)$/.exec(alt);
  if (ogr?.[1] && istek.yontem === 'GET') {
    if (ogr[2] === 'haftanin-yildizlari') return aldigiYildizlar(kurumId, ogr[1]);
    if (ogrenci) return izinYok();
    return ogrenciOzeti(kurumId, ogr[1]);
  }

  // Ogretmen / yonetici
  if (alt === 'haftanin-yildizlari' || alt.startsWith('haftanin-yildizlari/')) {
    return ogrenci
      ? izinYok()
      : yildizIstegi(
          kurumId,
          d,
          istek.yontem,
          alt.slice('haftanin-yildizlari'.length).replace(/^\//, ''),
          istek.govde,
        );
  }
  const dur = /^gruplar\/([^/]+)\/seri-duraklatmalari(?:\/([^/]+))?$/.exec(alt);
  if (dur?.[1]) {
    return ogrenci
      ? izinYok()
      : duraklatmaIstegi(kurumId, d, istek.yontem, dur[1], dur[2], istek.govde);
  }
  return bulunamadi();
}
