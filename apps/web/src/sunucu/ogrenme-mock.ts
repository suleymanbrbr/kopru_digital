import { MOCK_KURUM_ROLLERI, mockKurumVerisi } from './hesap-mock';
import type { MockIstek, MockYanit } from './vekil';
import { xlsxOku, xlsxYaz, type Hucre } from './xlsx-mini';

/**
 * `NEXT_PUBLIC_API_MOCK=1` iken `/api/ogrenme/*` ucunun bellek ici karsiligi: mufredat, odev, haftalik
 * plan ve deneme. Yanit sekilleri `@kopru/contracts` ile aynidir; gruplar, uyeler `hesap-mock`tan gelir.
 * Tohumlar sabit tarihlidir (plan tohumu bu haftaya baglidir, cunku "bu hafta" varsayilan gorunumdur).
 * Roller kurumdan gelir: `kurum-ege` ogretmen, `-mavi` yonetici, `-atlas` ogrenci, `-kuzey` sahip.
 * Yalniz deneme ve e2e icindir; veri sunucu sureci yeniden baslayana kadar bellekte kalir.
 */

type Kayit = Record<string, unknown>;

function ilk<T>(oge: T | undefined): T {
  if (oge === undefined) throw new Error('mock verisi eksik');
  return oge;
}

const hata = (durum: number, kod: string, mesaj: string, details?: unknown): MockYanit => ({
  durum,
  govde: { error: { code: kod, message: mesaj, ...(details === undefined ? {} : { details }) } },
});
const izinYok = () => hata(403, 'izin_yok', 'Bu işlem için yetkin yok.');
const bulunamadi = () => hata(404, 'bulunamadi', 'Kaynak bulunamadı.');
const dogrulama = (mesaj = 'İstek doğrulanamadı.') => hata(400, 'dogrulama_hatasi', mesaj);
const ok = (govde: unknown, durum = 200): MockYanit => ({ durum, govde });

const uid = () => crypto.randomUUID();
const GUN_MS = 86_400_000;
const simdi = () => new Date().toISOString();
const bugun = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const gunEkle = (tarih: string, gun: number) =>
  new Date(Date.parse(`${tarih}T00:00:00Z`) + gun * GUN_MS).toISOString().slice(0, 10);
const haftaGunu = (tarih: string) => (new Date(`${tarih}T00:00:00Z`).getUTCDay() + 6) % 7;
const pazartesi = (tarih: string) => gunEkle(tarih, -haftaGunu(tarih));
const TARIH = /^\d{4}-\d{2}-\d{2}$/;

function nesne(govde: unknown): Kayit {
  return typeof govde === 'object' && govde !== null ? (govde as Kayit) : {};
}
const metin = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const sayi = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;

function normalle(s: string): string {
  return s
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// --- Kimlik ve rol ----------------------------------------------------------------------------

type Rol = 'ogretmen' | 'yonetici' | 'ogrenci' | 'sahip';
const rolu = (kurumId: string): Rol => MOCK_KURUM_ROLLERI[kurumId] ?? 'ogretmen';
const personelMi = (kurumId: string) => rolu(kurumId) !== 'ogrenci';
const yonetimMi = (kurumId: string) => rolu(kurumId) === 'yonetici' || rolu(kurumId) === 'sahip';

function kimlikler(kurumId: string) {
  const v = mockKurumVerisi(kurumId);
  const ogretmen = v.uyeler.find((u) => u.rol === 'ogretmen');
  const ogrenciler = v.uyeler.filter((u) => u.rol === 'ogrenci');
  return {
    v,
    ogretmenId: ogretmen?.uyelik_id ?? uid(),
    ogrenciler,
    benId: ogrenciler[1]?.uyelik_id ?? '',
  };
}
const adi = (kurumId: string, id: string): string | null =>
  mockKurumVerisi(kurumId).uyeler.find((u) => u.uyelik_id === id)?.gorunen_ad ?? null;

function grupOgrencileri(kurumId: string, grupId: string): string[] {
  const { v } = kimlikler(kurumId);
  return (v.grupUyeleri[grupId] ?? [])
    .filter((u) => u.bitis_tarihi === null)
    .map((u) => u.ogrenci_id as string);
}

// --- Durum --------------------------------------------------------------------------------------

interface Konu extends Kayit {
  id: string;
  ad: string;
  brans_kodu: string;
  katalog_kodu: string | null;
  ust_id: string | null;
  seviye: string;
  sira: number;
  kullanimdan_kalkti: boolean;
  surum: number;
}
interface Odev extends Kayit {
  id: string;
  durum: 'taslak' | 'yayinda' | 'kapali';
  hedef_turu: string;
  hedef_id: string;
  surum: number;
}
interface OgrOdev extends Kayit {
  id: string;
  odev_id: string;
  ogrenci_id: string;
  durum: string;
}
interface Plan extends Kayit {
  id: string;
  ogrenci_id: string;
  hafta_baslangic: string;
  durum: 'taslak' | 'yayinda';
  surum: number;
}
interface Gorev extends Kayit {
  id: string;
  plan_id: string;
  ogrenci_id: string;
  hafta_baslangic: string;
  gun: string;
  sira: number;
  durum: string;
  surum: number;
}
interface Deneme extends Kayit {
  id: string;
  ogrenci_id: string;
  kural_kodu: string;
  sinav_tarihi: string;
  onay_durumu: string;
  surum: number;
  created_at: string;
  bolumler: Kayit[];
}
interface Kural extends Kayit {
  id: string;
  kod: string;
  yanlis_katsayisi: number;
  bolumler: { bolum_kodu: string; brans_kodu: string; ad: string; soru_sayisi: number }[];
}
interface Durum {
  konular: Konu[];
  odevler: Odev[];
  ogrOdevleri: OgrOdev[];
  odevSablonlari: Kayit[];
  planlar: Plan[];
  gorevler: Gorev[];
  planSablonlari: Kayit[];
  denemeler: Deneme[];
  kurallar: Kural[];
  ayarlar: { ogrenci_deneme_girisi: boolean };
}

const kutu = globalThis as unknown as { __kopruOgrenmeMock?: Record<string, Durum> };

/** Testler: tum ogrenme verisini bastan kurar. */
export function ogrenmeMockSifirla(): void {
  kutu.__kopruOgrenmeMock = undefined;
}

// --- Tohum: mufredat ------------------------------------------------------------------------

function konuYap(
  katalog: string,
  brans: string,
  ad: string,
  seviye: string,
  ust: string | null,
  sira: number,
  ek: Partial<Konu> = {},
): Konu {
  return {
    id: uid(),
    kurum_id: null,
    katalog_kodu: katalog,
    brans_kodu: brans,
    ust_id: ust,
    seviye,
    ad,
    kazanim_kodu: null,
    sira,
    sinif_seviyesi: katalog === 'lgs' ? 8 : null,
    gecerli_surum_baslangic: 1,
    gecerli_surum_bitis: null,
    yerine_gecen_id: null,
    arsivlendi_at: null,
    kullanimdan_kalkti: false,
    surum: 1,
    ...ek,
  };
}

function mufredatTohumu(): Konu[] {
  const k: Konu[] = [];
  const ekle = (
    katalog: string,
    brans: string,
    unite: string,
    konular: (string | [string, string[]])[],
    sira: number,
  ) => {
    const u = konuYap(katalog, brans, unite, 'unite', null, sira);
    k.push(u);
    konular.forEach((ko, i) => {
      const [ad, alt] = typeof ko === 'string' ? [ko, []] : ko;
      const kk = konuYap(katalog, brans, ad, 'konu', u.id, sira + i + 1);
      k.push(kk);
      alt.forEach((a, j) =>
        k.push(konuYap(katalog, brans, a, 'alt_konu', kk.id, sira + i + j + 2)),
      );
    });
  };
  ekle(
    'lgs',
    'matematik',
    'Üslü İfadeler',
    [
      'Tam sayıların negatif kuvvetleri',
      ['Bilimsel gösterim', ['Çok büyük sayıların bilimsel gösterimi']],
    ],
    10,
  );
  ekle('lgs', 'matematik', 'Kareköklü İfadeler', ['Kareköklü ifadelerde işlemler'], 20);
  ekle('lgs', 'fen_bilimleri', 'Mevsimler ve İklim', ['İklim ve hava olayları'], 30);
  ekle('tyt', 'turkce', 'Sözcükte Anlam', ['Deyimler ve atasözleri', 'Paragraf'], 40);
  ekle('tyt', 'matematik', 'Temel Kavramlar', ['Rasyonel sayılar', 'Üslü sayılar'], 50);
  ekle('ayt', 'fizik', 'Elektrik ve Manyetizma', ['Elektrik alanı'], 60);
  // Kullanimdan kalkmis (yeni secimde sunulmaz, rozetli listelenir).
  const matUnite = k.find((x) => x.ad === 'Üslü İfadeler');
  k.push(
    konuYap(
      'lgs',
      'matematik',
      'Eski müfredat: Üslü sayılar (kaldırıldı)',
      'konu',
      matUnite?.id ?? null,
      15,
      {
        gecerli_surum_bitis: 1,
        kullanimdan_kalkti: true,
      },
    ),
  );
  return k;
}

// --- Tohum: deneme kurallari ------------------------------------------------------------------

function kuralYap(
  kod: string,
  ad: string,
  katsayi: number,
  bolumler: [string, string, string, number][],
): Kural {
  return {
    id: uid(),
    kurum_id: null,
    global: true,
    kod,
    ad,
    yanlis_katsayisi: katsayi,
    bolumler: bolumler.map(([bolum_kodu, brans_kodu, bad, soru_sayisi]) => ({
      bolum_kodu,
      brans_kodu,
      ad: bad,
      soru_sayisi,
    })),
    toplam_soru_sayisi: bolumler.reduce((t, b) => t + b[3], 0),
    toplam_sure_dk: kod === 'lgs' ? 155 : 135,
    gecerli_yil: 2026,
    aktif: true,
    surum: 1,
  };
}

function kuralTohumu(): Kural[] {
  return [
    kuralYap('lgs', 'LGS', 0.3333, [
      ['turkce', 'turkce', 'Türkçe', 20],
      ['inkilap', 'inkilap_tarihi', 'T.C. İnkılap Tarihi', 10],
      ['din', 'din_kulturu', 'Din Kültürü', 10],
      ['ingilizce', 'ingilizce', 'Yabancı Dil', 10],
      ['matematik', 'matematik', 'Matematik', 20],
      ['fen', 'fen_bilimleri', 'Fen Bilimleri', 20],
    ]),
    kuralYap('tyt', 'TYT', 0.25, [
      ['turkce', 'turkce', 'Türkçe', 40],
      ['sosyal', 'tarih', 'Sosyal Bilimler', 20],
      ['matematik', 'matematik', 'Temel Matematik', 40],
      ['fen', 'fizik', 'Fen Bilimleri', 20],
    ]),
  ];
}

/** Net: tam sayi aritmetigiyle (katsayi 4 ondalik), 2 ondalik yuvarlama. */
export function netHesapla(dogru: number, yanlis: number, katsayi: number): number {
  const on = Math.round(katsayi * 10_000);
  return Math.round((dogru * 10_000 - yanlis * on) / 100) / 100;
}
const yuvarla2 = (n: number) => Math.round(n * 100) / 100;

function denemeYap(
  kurumId: string,
  kural: Kural,
  ogrenciId: string,
  ad: string,
  tarih: string,
  puanlar: [number, number][],
  ek: Kayit = {},
): Deneme {
  const bolumler = kural.bolumler.map((b, i) => {
    const [d, y] = puanlar[i] ?? [0, 0];
    return {
      bolum_kodu: b.bolum_kodu,
      brans_kodu: b.brans_kodu,
      soru_sayisi: b.soru_sayisi,
      dogru: d,
      yanlis: y,
      bos: b.soru_sayisi - d - y,
      net: netHesapla(d, y, kural.yanlis_katsayisi),
    };
  });
  return {
    id: uid(),
    ogrenci_id: ogrenciId,
    kural_id: kural.id,
    kural_kodu: kural.kod,
    yanlis_katsayisi: kural.yanlis_katsayisi,
    ad,
    yayinevi: null,
    sinav_tarihi: tarih,
    toplam_net: yuvarla2(bolumler.reduce((t, b) => t + b.net, 0)),
    giren_id: kimlikler(kurumId).ogretmenId,
    kaynak: 'ogretmen',
    sure_dk: null,
    not: null,
    onay_durumu: 'onaylandi',
    onaylayan_id: null,
    onay_at: null,
    red_nedeni: null,
    surum: 1,
    created_at: `${tarih}T10:00:00.000Z`,
    bolumler,
    ...ek,
  };
}

// --- Tohum: genel ---------------------------------------------------------------------------

function gorevYap(
  plan: Plan,
  gun: string,
  brans: string,
  hedefTuru: string,
  miktar: number,
  sira = 0,
  ek: Kayit = {},
): Gorev {
  return {
    id: uid(),
    plan_id: plan.id,
    ogrenci_id: plan.ogrenci_id,
    hafta_baslangic: plan.hafta_baslangic,
    gun,
    brans_kodu: brans,
    konu_id: null,
    baslik: null,
    hedef_turu: hedefTuru,
    hedef_miktar: miktar,
    gerceklesen_miktar: null,
    durum: 'bekliyor',
    tamamlandi_at: null,
    devreden_gorev_id: null,
    sira,
    surum: 1,
    ...ek,
  };
}

function planYap(
  ogrenciId: string,
  hafta: string,
  hazirlayan: string,
  durum: 'taslak' | 'yayinda',
  not: string | null = null,
): Plan {
  return {
    id: uid(),
    ogrenci_id: ogrenciId,
    hafta_baslangic: hafta,
    hazirlayan_id: hazirlayan,
    durum,
    yayin_at: durum === 'yayinda' ? simdi() : null,
    not,
    surum: 1,
    created_at: simdi(),
  };
}

function kur(kurumId: string): Durum {
  const { ogretmenId, ogrenciler, benId, v } = kimlikler(kurumId);
  const sinif = v.gruplar.find((g) => g.tur === 'sinif');
  const konular = mufredatTohumu();
  const kurallar = kuralTohumu();
  const tyt = ilk(kurallar[1]);
  const matKonu = konular.find((k) => k.ad === 'Tam sayıların negatif kuvvetleri');

  // Odevler: biri yayinda (sinif), biri taslak.
  const odevler: Odev[] = [];
  const ogrOdevleri: OgrOdev[] = [];
  const odevOlustur = (baslik: string, durum: 'taslak' | 'yayinda', sonGun: number): Odev => {
    const o: Odev = {
      id: uid(),
      baslik,
      aciklama: null,
      brans_kodu: 'matematik',
      konu_id: matKonu?.id ?? null,
      tur: 'soru',
      kaynak: 'Ornek Yayınları Test 4',
      hedef_turu: 'grup',
      hedef_id: sinif?.id ?? uid(),
      veren_id: ogretmenId,
      son_teslim_at: new Date(Date.now() + sonGun * GUN_MS).toISOString(),
      hedef_soru_sayisi: 20,
      fotograf_gerekli: false,
      durum,
      yayin_at: durum === 'yayinda' ? simdi() : null,
      fan_out_durum: durum === 'yayinda' ? 'tamamlandi' : 'bekliyor',
      atanan_sayisi: 0,
      surum: 1,
      created_at: simdi(),
    };
    odevler.push(o);
    return o;
  };
  const yayinda = odevOlustur('Üslü ifadeler test 4', 'yayinda', 3);
  odevOlustur('Kareköklü ifadeler (taslak)', 'taslak', 7);
  const uyeler = sinif ? grupOgrencileri(kurumId, sinif.id) : [];
  uyeler.forEach((ogrId, i) => {
    const row: OgrOdev = {
      id: uid(),
      odev_id: yayinda.id,
      ogrenci_id: ogrId,
      durum: 'atandi',
      teslim_edildi: false,
      gec_teslim: false,
      teslim_at: null,
      yapilan_soru_sayisi: null,
      dogru_sayisi: null,
      yanlis_sayisi: null,
      bos_sayisi: null,
      ogrenci_notu: null,
      inceleme_sonucu: null,
      inceleme_notu: null,
      incelendi_at: null,
    };
    if (i === 0 || i === 2) {
      Object.assign(row, {
        durum: 'teslim_edildi',
        teslim_edildi: true,
        teslim_at: simdi(),
        yapilan_soru_sayisi: 20,
        dogru_sayisi: i === 0 ? 17 : 12,
        yanlis_sayisi: i === 0 ? 2 : 6,
        bos_sayisi: i === 0 ? 1 : 2,
        ogrenci_notu: i === 0 ? 'Son soruda zorlandım.' : null,
      });
    }
    ogrOdevleri.push(row);
  });
  yayinda.atanan_sayisi = uyeler.length;

  // Plan: bu haftanin yayinda plani (ogrenci "ben" icin) ve gelecek haftaya taslak yok.
  const hafta = pazartesi(bugun());
  const planlar: Plan[] = [];
  const gorevler: Gorev[] = [];
  if (benId) {
    const p = planYap(benId, hafta, ogretmenId, 'yayinda', 'Bu hafta üslü ifadelere odaklan.');
    planlar.push(p);
    const secenek: [string, string, number][] = [
      ['matematik', 'soru', 30],
      ['fen_bilimleri', 'dakika', 45],
      ['matematik', 'soru', 25],
      ['turkce', 'dakika', 40],
      ['matematik', 'soru', 30],
      ['turkce', 'soru', 40],
      ['fen_bilimleri', 'dakika', 30],
    ];
    secenek.forEach(([b, h, m], i) => gorevler.push(gorevYap(p, gunEkle(hafta, i), b, h, m)));
    // Bir gorev iki ders: matematik Pazartesi'ye ikinci gorev.
    gorevler.push(gorevYap(p, hafta, 'geometri', 'soru', 15, 1));
  }

  // Denemeler: "ben" icin 3 onayli TYT + baska ogrenciler icin onayli ve bekleyen.
  const denemeler: Deneme[] = [];
  if (benId) {
    denemeler.push(
      denemeYap(kurumId, tyt, benId, 'TYT Deneme 1', '2026-08-15', [
        [30, 6],
        [10, 6],
        [24, 12],
        [8, 8],
      ]),
      denemeYap(kurumId, tyt, benId, 'TYT Deneme 2', '2026-09-12', [
        [32, 5],
        [12, 5],
        [28, 8],
        [10, 6],
      ]),
      denemeYap(kurumId, tyt, benId, 'TYT Deneme 3', '2026-10-10', [
        [35, 4],
        [14, 4],
        [32, 6],
        [12, 5],
      ]),
    );
  }
  const baskasi = ogrenciler[0];
  if (baskasi) {
    denemeler.push(
      denemeYap(kurumId, tyt, baskasi.uyelik_id, 'TYT Deneme 1', '2026-10-10', [
        [28, 8],
        [9, 7],
        [20, 14],
        [7, 9],
      ]),
      denemeYap(
        kurumId,
        tyt,
        baskasi.uyelik_id,
        'TYT Deneme (öğrenci girişi)',
        '2026-10-24',
        [
          [30, 6],
          [11, 6],
          [22, 10],
          [9, 6],
        ],
        {
          kaynak: 'ogrenci',
          onay_durumu: 'bekliyor',
          giren_id: baskasi.uyelik_id,
        },
      ),
    );
  }

  return {
    konular,
    odevler,
    ogrOdevleri,
    odevSablonlari: [],
    planlar,
    gorevler,
    planSablonlari: [],
    denemeler,
    kurallar,
    ayarlar: { ogrenci_deneme_girisi: true },
  };
}

function durum(kurumId: string): Durum {
  kutu.__kopruOgrenmeMock ??= {};
  kutu.__kopruOgrenmeMock[kurumId] ??= kur(kurumId);
  return kutu.__kopruOgrenmeMock[kurumId];
}

function sayfala<T extends { id: unknown }>(liste: T[], sorgu: URLSearchParams, varsayilan = 50) {
  const limit = Math.min(Math.max(Number(sorgu.get('limit') ?? varsayilan) || varsayilan, 1), 500);
  const imlec = sorgu.get('imlec');
  const basla = imlec ? liste.findIndex((o) => o.id === imlec) + 1 : 0;
  const dilim = liste.slice(basla, basla + limit);
  const sonraki = basla + limit < liste.length ? (ilk(dilim[dilim.length - 1]).id as string) : null;
  return { dilim, sonraki };
}

// --- Mufredat ---------------------------------------------------------------------------------

function mufredatIsle(s: Durum, kurumId: string, p: string[], i: MockIstek): MockYanit | null {
  if (p[0] === 'kataloglar' && i.yontem === 'GET') {
    return ok({
      kataloglar: (['lgs', 'tyt', 'ayt'] as const).map((k) => ({
        katalog_kodu: k,
        surumler: [
          {
            surum_no: 1,
            ad: `2026-2027 ${k.toUpperCase()}`,
            aciklama: null,
            yayinlandi_at: '2026-09-01T00:00:00.000Z',
          },
        ],
        en_yuksek_yayinlanmis: 1,
        kurum_surumu: null,
      })),
    });
  }
  if (p[0] !== 'konular') return null;
  const kurumKonusu = (k: Konu) => ({ ...k, kurum_id: k.katalog_kodu === null ? kurumId : null });
  if (p.length === 1 && i.yontem === 'GET') {
    const q = metin(i.sorgu.get('q'));
    const tumu = ['1', 'true'].includes(i.sorgu.get('tumu') ?? '');
    let liste = s.konular.filter((k) => tumu || !k.kullanimdan_kalkti);
    for (const alan of ['katalog_kodu', 'brans_kodu', 'ust_id', 'seviye'] as const) {
      const d = i.sorgu.get(alan);
      if (d) liste = liste.filter((k) => k[alan] === d);
    }
    const kaynak = i.sorgu.get('kaynak');
    if (kaynak === 'global') liste = liste.filter((k) => k.katalog_kodu !== null);
    if (kaynak === 'kurum') liste = liste.filter((k) => k.katalog_kodu === null);
    if (q) liste = liste.filter((k) => normalle(k.ad).includes(normalle(q)));
    liste = [...liste].sort((a, b) => a.sira - b.sira);
    const { dilim, sonraki } = sayfala(liste, i.sorgu, 100);
    return ok({
      konular: dilim.map(kurumKonusu),
      surumler: [],
      sonraki_imlec: sonraki,
    });
  }
  const yonetim = yonetimMi(kurumId);
  if (p.length === 1 && i.yontem === 'POST') {
    if (!yonetim) return izinYok();
    const g = nesne(i.govde);
    const ad = metin(g.ad);
    const brans = metin(g.brans_kodu);
    const seviye = metin(g.seviye);
    if (!ad || !brans || !seviye || !['unite', 'konu', 'alt_konu'].includes(seviye))
      return dogrulama();
    const ustId = metin(g.ust_id);
    const ust = ustId ? s.konular.find((k) => k.id === ustId) : undefined;
    const beklenen = seviye === 'unite' ? null : seviye === 'konu' ? 'unite' : 'konu';
    if ((beklenen === null && ustId) || (beklenen !== null && ust?.seviye !== beklenen)) {
      return hata(422, 'konu_ust_gecersiz', 'Üst konu geçersiz.');
    }
    const yeni = konuYap('', brans, ad, seviye, ustId, typeof g.sira === 'number' ? g.sira : 0);
    yeni.katalog_kodu = null;
    yeni.kurum_id = kurumId;
    yeni.sinif_seviyesi = null;
    s.konular.push(yeni);
    return ok(kurumKonusu(yeni), 201);
  }
  const konu = s.konular.find((k) => k.id === p[1]);
  if (!konu) return bulunamadi();
  if (p.length === 2 && i.yontem === 'GET') return ok({ ...kurumKonusu(konu), ust_zinciri: [] });
  if (i.yontem === 'PATCH' || i.yontem === 'POST') {
    if (!yonetim) return izinYok();
    if (konu.katalog_kodu !== null) {
      return hata(403, 'global_konu_yazilamaz', 'Global katalog konusu değiştirilemez.');
    }
    if (p.length === 2 && i.yontem === 'PATCH') {
      const g = nesne(i.govde);
      if (metin(g.ad)) konu.ad = metin(g.ad) ?? konu.ad;
      if (typeof g.sira === 'number') konu.sira = g.sira;
      konu.surum += 1;
      return ok(kurumKonusu(konu));
    }
    if (p[2] === 'arsivle' || p[2] === 'arsivden-cikar') {
      const arsiv = p[2] === 'arsivle';
      konu.arsivlendi_at = arsiv ? simdi() : null;
      konu.kullanimdan_kalkti = arsiv;
      konu.surum += 1;
      return ok(kurumKonusu(konu));
    }
  }
  return null;
}

// --- Odev -------------------------------------------------------------------------------------

function odevHedefOgrencileri(kurumId: string, o: Odev): string[] {
  if (o.hedef_turu === 'ogrenci') return [o.hedef_id];
  if (o.hedef_turu === 'grup') return grupOgrencileri(kurumId, o.hedef_id);
  return kimlikler(kurumId).ogrenciler.map((u) => u.uyelik_id);
}

function ogrOdevAcilmis(odevId: string, ogrenciId: string): OgrOdev {
  return {
    id: uid(),
    odev_id: odevId,
    ogrenci_id: ogrenciId,
    durum: 'atandi',
    teslim_edildi: false,
    gec_teslim: false,
    teslim_at: null,
    yapilan_soru_sayisi: null,
    dogru_sayisi: null,
    yanlis_sayisi: null,
    bos_sayisi: null,
    ogrenci_notu: null,
    inceleme_sonucu: null,
    inceleme_notu: null,
    incelendi_at: null,
  };
}

function odevGorunumu(s: Durum, o: Odev): Kayit {
  const sayi = s.ogrOdevleri.filter((r) => r.odev_id === o.id && r.durum !== 'iptal').length;
  return { ...o, atanan_sayisi: o.durum === 'taslak' ? 0 : sayi };
}

function ogrenciOdevi(s: Durum, r: OgrOdev): Kayit {
  const o = ilk(s.odevler.find((x) => x.id === r.odev_id));
  return {
    id: r.id,
    odev_id: o.id,
    baslik: o.baslik,
    aciklama: o.aciklama,
    brans_kodu: o.brans_kodu,
    konu_id: o.konu_id,
    tur: o.tur,
    kaynak: o.kaynak,
    hedef_soru_sayisi: o.hedef_soru_sayisi,
    fotograf_gerekli: o.fotograf_gerekli,
    odev_durum: o.durum,
    durum: r.durum,
    son_teslim_at: o.son_teslim_at,
    yapilan_soru_sayisi: r.yapilan_soru_sayisi,
    dogru_sayisi: r.dogru_sayisi,
    yanlis_sayisi: r.yanlis_sayisi,
    bos_sayisi: r.bos_sayisi,
    ogrenci_notu: r.ogrenci_notu,
    teslim_at: r.teslim_at,
    gec_teslim: r.gec_teslim,
    inceleme_sonucu: r.inceleme_sonucu,
    inceleme_notu: r.inceleme_notu,
    incelendi_at: r.incelendi_at,
  };
}

function ozetSatiri(kurumId: string, o: Odev, r: OgrOdev): Kayit {
  const yapilan = r.yapilan_soru_sayisi as number | null;
  const dogru = r.dogru_sayisi as number | null;
  const gecikme =
    r.durum === 'atandi' &&
    o.son_teslim_at !== null &&
    Date.parse(o.son_teslim_at as string) < Date.now();
  return {
    ogrenci_odev_id: r.id,
    ogrenci_id: r.ogrenci_id,
    gorunen_ad: adi(kurumId, r.ogrenci_id),
    durum: r.durum,
    teslim_edildi: r.teslim_edildi,
    gec_teslim: r.gec_teslim === true || gecikme,
    son_teslim_at: o.son_teslim_at,
    teslim_at: r.teslim_at,
    yapilan_soru_sayisi: yapilan,
    dogru_sayisi: dogru,
    yanlis_sayisi: r.yanlis_sayisi,
    bos_sayisi: r.bos_sayisi,
    dogru_orani: yapilan && dogru !== null ? Math.round((dogru / yapilan) * 100) / 100 : null,
    ogrenci_notu: r.ogrenci_notu,
    inceleme_sonucu: r.inceleme_sonucu,
    inceleme_notu: r.inceleme_notu,
  };
}

function odevIsle(s: Durum, kurumId: string, p: string[], i: MockIstek): MockYanit | null {
  const personel = personelMi(kurumId);
  const { ogretmenId, benId } = kimlikler(kurumId);

  if (p[0] === 'odevlerim' && i.yontem === 'GET') {
    if (personel) return izinYok();
    const d = i.sorgu.get('durum');
    const liste = s.ogrOdevleri
      .filter((r) => r.ogrenci_id === benId && r.durum !== 'iptal' && (!d || r.durum === d))
      .filter((r) => ilk(s.odevler.find((o) => o.id === r.odev_id)).durum !== 'taslak');
    const { dilim, sonraki } = sayfala(liste, i.sorgu);
    return ok({ odevler: dilim.map((r) => ogrenciOdevi(s, r)), sonraki_imlec: sonraki });
  }

  if (p[0] === 'odev-sablonlari') {
    if (!personel) return izinYok();
    if (p.length === 1 && i.yontem === 'GET') return ok({ sablonlar: s.odevSablonlari });
    if (p.length === 1 && i.yontem === 'POST') {
      const g = nesne(i.govde);
      const baslik = metin(g.baslik);
      const brans = metin(g.brans_kodu);
      if (!baslik || !brans) return dogrulama();
      const sb = {
        id: uid(),
        ogretmen_id: ogretmenId,
        baslik,
        aciklama: metin(g.aciklama),
        brans_kodu: brans,
        konu_id: metin(g.konu_id),
        tur: metin(g.tur) ?? 'soru',
        kaynak: metin(g.kaynak),
        hedef_soru_sayisi: sayi(g.hedef_soru_sayisi),
        created_at: simdi(),
      };
      s.odevSablonlari.push(sb);
      return ok(sb, 201);
    }
    const sb = s.odevSablonlari.find((x) => x.id === p[1]);
    if (!sb) return bulunamadi();
    if (i.yontem === 'GET') return ok(sb);
    if (i.yontem === 'DELETE') {
      s.odevSablonlari = s.odevSablonlari.filter((x) => x.id !== p[1]);
      return { durum: 204 };
    }
    if (i.yontem === 'PATCH') {
      Object.assign(sb, nesne(i.govde));
      return ok(sb);
    }
    return null;
  }

  if (p[0] === 'ogrenci-odevleri' && p[1] && i.yontem === 'POST') {
    const r = s.ogrOdevleri.find((x) => x.id === p[1]);
    if (!r) return bulunamadi();
    const o = ilk(s.odevler.find((x) => x.id === r.odev_id));
    const g = nesne(i.govde);
    if (p[2] === 'teslim') {
      if (personel || r.ogrenci_id !== benId) return personel ? izinYok() : bulunamadi();
      if (o.durum !== 'yayinda') return hata(409, 'odev_kapali', 'Ödev kapalı.');
      const yapilan = sayi(g.yapilan_soru_sayisi);
      if (yapilan === null) return dogrulama();
      const [d, y, b] = [sayi(g.dogru_sayisi), sayi(g.yanlis_sayisi), sayi(g.bos_sayisi)];
      if ((d ?? 0) + (y ?? 0) + (b ?? 0) > yapilan) return dogrulama('Sayılar toplamı aşıyor.');
      Object.assign(r, {
        durum: 'teslim_edildi',
        teslim_edildi: true,
        teslim_at: simdi(),
        gec_teslim: o.son_teslim_at !== null && Date.parse(o.son_teslim_at as string) < Date.now(),
        yapilan_soru_sayisi: yapilan,
        dogru_sayisi: d,
        yanlis_sayisi: y,
        bos_sayisi: b,
        ogrenci_notu: metin(g.ogrenci_notu),
        inceleme_sonucu: null,
        inceleme_notu: null,
      });
      return ok(ogrenciOdevi(s, r));
    }
    if (p[2] === 'inceleme') {
      if (!personel) return izinYok();
      const sonuc = metin(g.sonuc);
      if (!sonuc || !['tamam', 'eksik', 'tekrar'].includes(sonuc)) return dogrulama();
      if (!r.teslim_edildi || (r.durum !== 'teslim_edildi' && r.durum !== 'incelendi')) {
        return hata(409, 'inceleme_durumu_gecersiz', 'Teslim edilmemiş ödev incelenemez.');
      }
      Object.assign(r, {
        durum: sonuc === 'tekrar' ? 'tekrar_istendi' : 'incelendi',
        inceleme_sonucu: sonuc,
        inceleme_notu: metin(g.not),
        incelendi_at: simdi(),
      });
      return ok(ogrenciOdevi(s, r));
    }
    return null;
  }

  if (p[0] !== 'odevler') return null;
  if (!personel) return izinYok();

  if (p.length === 1 && i.yontem === 'POST') {
    const g = nesne(i.govde);
    const baslik = metin(g.baslik);
    const brans = metin(g.brans_kodu);
    const hedefTuru = metin(g.hedef_turu);
    if (!baslik || !brans || !hedefTuru) return dogrulama();
    if (['kademe', 'kurum'].includes(hedefTuru) && !yonetimMi(kurumId)) return izinYok();
    const hedefId = hedefTuru === 'kurum' ? kurumId : metin(g.hedef_id);
    if (!hedefId) return dogrulama();
    const o: Odev = {
      id: uid(),
      baslik,
      aciklama: metin(g.aciklama),
      brans_kodu: brans,
      konu_id: metin(g.konu_id),
      tur: metin(g.tur) ?? 'soru',
      kaynak: metin(g.kaynak),
      hedef_turu: hedefTuru,
      hedef_id: hedefId,
      veren_id: ogretmenId,
      son_teslim_at: metin(g.son_teslim_at),
      hedef_soru_sayisi: sayi(g.hedef_soru_sayisi),
      fotograf_gerekli: g.fotograf_gerekli === true,
      durum: 'taslak',
      yayin_at: null,
      fan_out_durum: 'bekliyor',
      atanan_sayisi: 0,
      surum: 1,
      created_at: simdi(),
    };
    s.odevler.unshift(o);
    return ok(odevGorunumu(s, o), 201);
  }
  if (p.length === 1 && i.yontem === 'GET') {
    const d = i.sorgu.get('durum');
    const liste = s.odevler.filter((o) => !d || o.durum === d);
    const { dilim, sonraki } = sayfala(liste, i.sorgu);
    return ok({ odevler: dilim.map((o) => odevGorunumu(s, o)), sonraki_imlec: sonraki });
  }
  const o = s.odevler.find((x) => x.id === p[1]);
  if (!o) return bulunamadi();
  if (p.length === 2 && i.yontem === 'GET') return ok(odevGorunumu(s, o));
  if (p.length === 2 && i.yontem === 'PATCH') {
    const g = nesne(i.govde);
    for (const alan of [
      'baslik',
      'aciklama',
      'brans_kodu',
      'konu_id',
      'tur',
      'kaynak',
      'son_teslim_at',
      'hedef_soru_sayisi',
      'fotograf_gerekli',
    ])
      if (alan in g) o[alan] = g[alan];
    o.surum += 1;
    return ok(odevGorunumu(s, o));
  }
  if (p[2] === 'yayinla' && i.yontem === 'POST') {
    if (o.durum === 'kapali') return hata(409, 'odev_kapali', 'Ödev kapalı.');
    if (o.durum === 'taslak') {
      o.durum = 'yayinda';
      o.yayin_at = simdi();
      o.fan_out_durum = 'tamamlandi';
      for (const ogrId of odevHedefOgrencileri(kurumId, o))
        s.ogrOdevleri.push(ogrOdevAcilmis(o.id, ogrId));
    }
    return ok(odevGorunumu(s, o));
  }
  if (p[2] === 'kapat' && i.yontem === 'POST') {
    o.durum = 'kapali';
    return ok(odevGorunumu(s, o));
  }
  if (p[2] === 'atama-esitle' && i.yontem === 'POST') {
    if (o.durum !== 'yayinda') return hata(409, 'odev_yayinda_degil', 'Ödev yayında değil.');
    let eklenen = 0;
    for (const ogrId of odevHedefOgrencileri(kurumId, o)) {
      if (!s.ogrOdevleri.some((r) => r.odev_id === o.id && r.ogrenci_id === ogrId)) {
        s.ogrOdevleri.push(ogrOdevAcilmis(o.id, ogrId));
        eklenen += 1;
      }
    }
    return ok({
      eklenen,
      yeniden_acilan: 0,
      atanan_sayisi: s.ogrOdevleri.filter((r) => r.odev_id === o.id).length,
    });
  }
  if (p[2] === 'ozet' && i.yontem === 'GET') {
    const satirlar = s.ogrOdevleri
      .filter((r) => r.odev_id === o.id)
      .map((r) => ozetSatiri(kurumId, o, r))
      .sort((a, b) => String(a.gorunen_ad).localeCompare(String(b.gorunen_ad), 'tr'));
    const say = (d: string) => satirlar.filter((r) => r.durum === d).length;
    const oranlar = satirlar
      .map((r) => r.dogru_orani as number | null)
      .filter((x): x is number => x !== null);
    return ok({
      odev: odevGorunumu(s, o),
      sayilar: {
        atanan: satirlar.filter((r) => r.durum !== 'iptal').length,
        atandi: say('atandi'),
        teslim_edildi: say('teslim_edildi'),
        incelendi: say('incelendi'),
        tekrar_istendi: say('tekrar_istendi'),
        iptal: say('iptal'),
        gec_teslim: satirlar.filter((r) => r.gec_teslim === true).length,
        ortalama_dogru_orani: oranlar.length
          ? Math.round((oranlar.reduce((t, x) => t + x, 0) / oranlar.length) * 100) / 100
          : null,
      },
      ogrenciler: satirlar,
    });
  }
  return null;
}

// --- Haftalik plan ------------------------------------------------------------------------------

const planKilitli = (hafta: string) => bugun() > gunEkle(hafta, 20);

function planDetayi(s: Durum, ogrenciId: string, hafta: string, ogrenciRolu: boolean): Kayit {
  const plan = s.planlar.find((p) => p.ogrenci_id === ogrenciId && p.hafta_baslangic === hafta);
  const gorunur = plan && (!ogrenciRolu || plan.durum === 'yayinda') ? plan : undefined;
  const gorevler = gorunur
    ? s.gorevler
        .filter((g) => g.plan_id === gorunur.id)
        .sort((a, b) => a.gun.localeCompare(b.gun) || a.sira - b.sira)
    : [];
  return {
    ogrenci_id: ogrenciId,
    hafta_baslangic: hafta,
    kilitli: planKilitli(hafta),
    plan: gorunur ?? null,
    gorevler,
  };
}

const KILITLI = () => hata(409, 'plan_kilitli', 'Bu hafta kilitli.');

function gorevDurumu(hedef: number, gerceklesen: number): string {
  if (gerceklesen >= hedef) return 'tamam';
  return gerceklesen > 0 ? 'kismen' : 'yapilmadi';
}

function gorevleriKopyala(
  s: Durum,
  hedef: Plan,
  kaynak: {
    gun_sirasi: number;
    brans_kodu: unknown;
    konu_id: unknown;
    baslik: unknown;
    hedef_turu: unknown;
    hedef_miktar: unknown;
    sira: unknown;
  }[],
): void {
  for (const k of kaynak) {
    s.gorevler.push(
      gorevYap(
        hedef,
        gunEkle(hedef.hafta_baslangic, k.gun_sirasi),
        String(k.brans_kodu),
        String(k.hedef_turu),
        Number(k.hedef_miktar),
        Number(k.sira ?? 0),
        {
          konu_id: k.konu_id ?? null,
          baslik: k.baslik ?? null,
        },
      ),
    );
  }
}

function planOzeti(s: Durum, plan: Plan): Kayit {
  const gorevler = s.gorevler.filter((g) => g.plan_id === plan.id);
  const dersler = new Map<
    string,
    { soru: [number, number]; dakika: [number, number]; n: number; tamam: number }
  >();
  for (const g of gorevler) {
    const brans = String(g.brans_kodu);
    const d = dersler.get(brans) ?? { soru: [0, 0], dakika: [0, 0], n: 0, tamam: 0 };
    const devredildi = g.durum === 'devredildi';
    const tur = g.hedef_turu === 'soru' ? 'soru' : 'dakika';
    const gercek = (g.gerceklesen_miktar as number | null) ?? 0;
    d[tur][0] += devredildi ? gercek : (g.hedef_miktar as number);
    d[tur][1] += gercek;
    if (!devredildi) d.n += 1;
    if (g.durum === 'tamam') d.tamam += 1;
    dersler.set(brans, d);
  }
  const liste = [...dersler.entries()].map(([brans_kodu, d]) => ({
    brans_kodu,
    soru: { planlanan: d.soru[0], gerceklesen: d.soru[1] },
    dakika: { planlanan: d.dakika[0], gerceklesen: d.dakika[1] },
    gorev_sayisi: d.n,
    tamam_sayisi: d.tamam,
  }));
  const topla = (f: (x: (typeof liste)[number]) => number) => liste.reduce((t, x) => t + f(x), 0);
  return {
    plan_id: plan.id,
    ogrenci_id: plan.ogrenci_id,
    hafta_baslangic: plan.hafta_baslangic,
    dersler: liste,
    toplam: {
      soru: {
        planlanan: topla((x) => x.soru.planlanan),
        gerceklesen: topla((x) => x.soru.gerceklesen),
      },
      dakika: {
        planlanan: topla((x) => x.dakika.planlanan),
        gerceklesen: topla((x) => x.dakika.gerceklesen),
      },
      gorev_sayisi: topla((x) => x.gorev_sayisi),
      tamam_sayisi: topla((x) => x.tamam_sayisi),
    },
  };
}

function planIsle(s: Durum, kurumId: string, p: string[], i: MockIstek): MockYanit | null {
  const personel = personelMi(kurumId);
  const { ogretmenId, benId } = kimlikler(kurumId);
  const haftaOf = (g: unknown) =>
    typeof g === 'string' && TARIH.test(g) ? pazartesi(g) : pazartesi(bugun());

  // --- Ogrenci ---
  if (p[0] === 'planim' && i.yontem === 'GET') {
    if (personel) return izinYok();
    return ok(planDetayi(s, benId, haftaOf(i.sorgu.get('hafta')), true));
  }
  if (p[0] === 'gorevlerim' && i.yontem === 'GET') {
    if (personel) return izinYok();
    const gun = i.sorgu.get('gun') ?? bugun();
    const yayindaki = new Set(s.planlar.filter((x) => x.durum === 'yayinda').map((x) => x.id));
    return ok({
      gun,
      gorevler: s.gorevler.filter(
        (g) =>
          g.ogrenci_id === benId &&
          g.gun === gun &&
          g.durum !== 'devredildi' &&
          yayindaki.has(g.plan_id),
      ),
    });
  }
  if (p[0] === 'gorevler' && p[1] && p[2] === 'gerceklesen' && i.yontem === 'PUT') {
    if (personel) return izinYok();
    const g = s.gorevler.find((x) => x.id === p[1] && x.ogrenci_id === benId);
    if (!g) return bulunamadi();
    const miktar = sayi(nesne(i.govde).gerceklesen_miktar);
    if (miktar === null) return dogrulama();
    if (g.gerceklesen_miktar === miktar) return ok(g);
    if (planKilitli(g.hafta_baslangic)) return KILITLI();
    g.gerceklesen_miktar = miktar;
    g.durum = gorevDurumu(g.hedef_miktar as number, miktar);
    g.tamamlandi_at = g.durum === 'tamam' ? simdi() : null;
    g.surum += 1;
    return ok(g);
  }
  if (p[0] === 'gorevler' && p[1] && p[2] === 'devret' && i.yontem === 'POST') {
    if (personel) return izinYok();
    const g = s.gorevler.find((x) => x.id === p[1] && x.ogrenci_id === benId);
    if (!g) return bulunamadi();
    if (g.durum === 'devredildi')
      return hata(409, 'gorev_zaten_devredildi', 'Görev zaten devredildi.');
    if (planKilitli(g.hafta_baslangic)) return KILITLI();
    const hedefGun = metin(nesne(i.govde).hedef_gun) ?? gunEkle(g.gun, 1);
    if (hedefGun <= g.gun || hedefGun > gunEkle(g.hafta_baslangic, 6)) {
      return hata(422, 'hedef_gun_gecersiz', 'Hedef gün geçersiz.');
    }
    const kalan = Math.max(
      1,
      (g.hedef_miktar as number) - ((g.gerceklesen_miktar as number | null) ?? 0),
    );
    const plan = ilk(s.planlar.find((x) => x.id === g.plan_id));
    const yeni = gorevYap(plan, hedefGun, String(g.brans_kodu), String(g.hedef_turu), kalan, 0, {
      konu_id: g.konu_id,
      baslik: g.baslik,
      devreden_gorev_id: g.id,
    });
    g.durum = 'devredildi';
    g.surum += 1;
    s.gorevler.push(yeni);
    return ok({ eski: g, yeni }, 201);
  }

  // --- Sablonlar ---
  if (p[0] === 'plan-sablonlari') {
    if (!personel) return izinYok();
    if (p.length === 1 && i.yontem === 'GET') return ok({ sablonlar: s.planSablonlari });
    const sablonGorevleri = (ham: unknown) =>
      (Array.isArray(ham) ? ham : []).map((x) => {
        const g = nesne(x);
        return {
          id: uid(),
          gun_sirasi: Number(g.gun_sirasi),
          brans_kodu: g.brans_kodu,
          konu_id: g.konu_id ?? null,
          baslik: g.baslik ?? null,
          hedef_turu: g.hedef_turu,
          hedef_miktar: g.hedef_miktar,
          sira: g.sira ?? 0,
        };
      });
    if (p.length === 1 && i.yontem === 'POST') {
      const g = nesne(i.govde);
      const ad = metin(g.ad);
      if (!ad) return dogrulama();
      const sb = {
        id: uid(),
        ogretmen_id: ogretmenId,
        ad,
        aciklama: metin(g.aciklama),
        gorevler: sablonGorevleri(g.gorevler),
        created_at: simdi(),
      };
      s.planSablonlari.push(sb);
      return ok(sb, 201);
    }
    const sb = s.planSablonlari.find((x) => x.id === p[1]);
    if (!sb) return bulunamadi();
    if (p.length === 2 && i.yontem === 'GET') return ok(sb);
    if (p.length === 2 && i.yontem === 'DELETE') {
      s.planSablonlari = s.planSablonlari.filter((x) => x.id !== p[1]);
      return { durum: 204 };
    }
    if (p.length === 2 && i.yontem === 'PATCH') {
      const g = nesne(i.govde);
      if (metin(g.ad)) sb.ad = metin(g.ad);
      if ('aciklama' in g) sb.aciklama = metin(g.aciklama);
      if (Array.isArray(g.gorevler)) sb.gorevler = sablonGorevleri(g.gorevler);
      return ok(sb);
    }
    if (p[2] === 'uygula' && i.yontem === 'POST') {
      const g = nesne(i.govde);
      const ogrenciId = metin(g.ogrenci_id);
      const hafta = metin(g.hafta_baslangic);
      if (!ogrenciId || !hafta || !TARIH.test(hafta)) return dogrulama();
      if (haftaGunu(hafta) !== 0)
        return hata(422, 'hafta_pazartesi_degil', 'Hafta Pazartesi ile başlamalı.');
      if (planKilitli(hafta)) return KILITLI();
      let plan = s.planlar.find((x) => x.ogrenci_id === ogrenciId && x.hafta_baslangic === hafta);
      if (plan && s.gorevler.some((x) => x.plan_id === plan?.id))
        return hata(409, 'plan_dolu', 'Bu haftanın planı dolu.');
      if (!plan) {
        plan = planYap(ogrenciId, hafta, ogretmenId, 'taslak');
        s.planlar.push(plan);
      }
      gorevleriKopyala(s, plan, sb.gorevler as Parameters<typeof gorevleriKopyala>[2]);
      return ok(planDetayi(s, ogrenciId, hafta, false), 201);
    }
    return null;
  }

  // --- Ogretmen: plan ---
  if (p[0] === 'ogrenciler' && p[2] === 'plan' && i.yontem === 'GET') {
    if (!personel) return izinYok();
    return ok(planDetayi(s, ilk(p[1]), haftaOf(i.sorgu.get('hafta')), false));
  }
  if (p[0] === 'planlar' && p[1] === 'toplu' && i.yontem === 'POST') {
    if (!personel) return izinYok();
    const g = nesne(i.govde);
    const grupId = metin(g.grup_id);
    const hafta = metin(g.hafta_baslangic);
    if (!grupId || !hafta || !TARIH.test(hafta)) return dogrulama();
    if (haftaGunu(hafta) !== 0)
      return hata(422, 'hafta_pazartesi_degil', 'Hafta Pazartesi ile başlamalı.');
    if (planKilitli(hafta)) return KILITLI();
    const sablon = s.planSablonlari.find((x) => x.id === g.sablon_id);
    const kaynak = (sablon?.gorevler ?? g.gorevler) as
      Parameters<typeof gorevleriKopyala>[2] | undefined;
    if (!kaynak?.length) return dogrulama();
    const planlar: Kayit[] = [];
    for (const ogrId of grupOgrencileri(kurumId, grupId)) {
      const var_ = s.planlar.find((x) => x.ogrenci_id === ogrId && x.hafta_baslangic === hafta);
      if (var_) {
        planlar.push({ ogrenci_id: ogrId, plan_id: var_.id, sonuc: 'zaten_var' });
        continue;
      }
      const plan = planYap(ogrId, hafta, ogretmenId, g.yayinla === true ? 'yayinda' : 'taslak');
      s.planlar.push(plan);
      gorevleriKopyala(s, plan, kaynak);
      planlar.push({ ogrenci_id: ogrId, plan_id: plan.id, sonuc: 'olusturuldu' });
    }
    return ok({
      grup_id: grupId,
      hafta_baslangic: hafta,
      olusturulan: planlar.filter((x) => x.sonuc === 'olusturuldu').length,
      atlanan: planlar.filter((x) => x.sonuc === 'zaten_var').length,
      planlar,
    });
  }
  if (p[0] === 'planlar' && p.length === 1 && i.yontem === 'POST') {
    if (!personel) return izinYok();
    const g = nesne(i.govde);
    const ogrenciId = metin(g.ogrenci_id);
    const hafta = metin(g.hafta_baslangic);
    if (!ogrenciId || !hafta || !TARIH.test(hafta)) return dogrulama();
    if (haftaGunu(hafta) !== 0)
      return hata(422, 'hafta_pazartesi_degil', 'Hafta Pazartesi ile başlamalı.');
    if (planKilitli(hafta)) return KILITLI();
    if (s.planlar.some((x) => x.ogrenci_id === ogrenciId && x.hafta_baslangic === hafta)) {
      return hata(409, 'plan_zaten_var', 'Bu hafta için plan zaten var.');
    }
    s.planlar.push(planYap(ogrenciId, hafta, ogretmenId, 'taslak', metin(g.not)));
    return ok(planDetayi(s, ogrenciId, hafta, false), 201);
  }
  if (p[0] === 'planlar' && p[1]) {
    const plan = s.planlar.find((x) => x.id === p[1]);
    if (!plan) return bulunamadi();
    if (!personel && (plan.ogrenci_id !== benId || plan.durum !== 'yayinda')) return bulunamadi();
    const detay = () => planDetayi(s, plan.ogrenci_id, plan.hafta_baslangic, false);
    if (p.length === 2 && i.yontem === 'GET') return ok(detay());
    if (p[2] === 'ozet' && i.yontem === 'GET') return ok(planOzeti(s, plan));
    if (!personel) return izinYok();
    if (p[2] === 'not' && i.yontem === 'PUT') {
      if (planKilitli(plan.hafta_baslangic)) return KILITLI();
      plan.not = metin(nesne(i.govde).not);
      plan.surum += 1;
      return ok(detay());
    }
    if (p[2] === 'yayinla' && i.yontem === 'POST') {
      if (planKilitli(plan.hafta_baslangic)) return KILITLI();
      if (plan.durum === 'taslak') {
        plan.durum = 'yayinda';
        plan.yayin_at = simdi();
        plan.surum += 1;
      }
      return ok(detay());
    }
    if (p[2] === 'gorevler' && i.yontem === 'POST') {
      if (planKilitli(plan.hafta_baslangic)) return KILITLI();
      const g = nesne(i.govde);
      const gun = metin(g.gun);
      const brans = metin(g.brans_kodu);
      const miktar = typeof g.hedef_miktar === 'number' ? g.hedef_miktar : 0;
      if (!gun || !brans || !['soru', 'dakika'].includes(String(g.hedef_turu)) || miktar < 1)
        return dogrulama();
      if (gun < plan.hafta_baslangic || gun > gunEkle(plan.hafta_baslangic, 6)) {
        return hata(422, 'gun_hafta_disinda', 'Gün bu haftanın dışında.');
      }
      const yeni = gorevYap(
        plan,
        gun,
        brans,
        String(g.hedef_turu),
        miktar,
        typeof g.sira === 'number' ? g.sira : 0,
        {
          konu_id: metin(g.konu_id),
          baslik: metin(g.baslik),
        },
      );
      s.gorevler.push(yeni);
      return ok(yeni, 201);
    }
    if (p[2] === 'kopyala' && i.yontem === 'POST') {
      const hedefHafta =
        metin(nesne(i.govde).hedef_hafta_baslangic) ?? gunEkle(plan.hafta_baslangic, 7);
      if (haftaGunu(hedefHafta) !== 0)
        return hata(422, 'hafta_pazartesi_degil', 'Hafta Pazartesi ile başlamalı.');
      if (planKilitli(hedefHafta)) return KILITLI();
      let hedef = s.planlar.find(
        (x) => x.ogrenci_id === plan.ogrenci_id && x.hafta_baslangic === hedefHafta,
      );
      if (hedef && s.gorevler.some((x) => x.plan_id === hedef?.id))
        return hata(409, 'plan_dolu', 'Hedef haftanın planı dolu.');
      if (!hedef) {
        hedef = planYap(plan.ogrenci_id, hedefHafta, ogretmenId, 'taslak');
        s.planlar.push(hedef);
      }
      gorevleriKopyala(
        s,
        hedef,
        s.gorevler
          .filter((x) => x.plan_id === plan.id && x.durum !== 'devredildi')
          .map((x) => ({
            gun_sirasi: haftaGunu(x.gun),
            brans_kodu: x.brans_kodu,
            konu_id: x.konu_id,
            baslik: x.baslik,
            hedef_turu: x.hedef_turu,
            hedef_miktar: x.hedef_miktar,
            sira: x.sira,
          })),
      );
      return ok(planDetayi(s, plan.ogrenci_id, hedefHafta, false), 201);
    }
    return null;
  }
  if (p[0] === 'gorevler' && p[1] && p.length === 2) {
    if (!personel) return izinYok();
    const g = s.gorevler.find((x) => x.id === p[1]);
    if (!g) return bulunamadi();
    if (planKilitli(g.hafta_baslangic)) return KILITLI();
    if (i.yontem === 'DELETE') {
      const plan = s.planlar.find((x) => x.id === g.plan_id);
      if (s.gorevler.some((x) => x.devreden_gorev_id === g.id))
        return hata(409, 'gorev_silinemez', 'Görev silinemez.');
      if (plan?.durum === 'yayinda' && g.gerceklesen_miktar !== null)
        return hata(409, 'gorev_silinemez', 'Görev silinemez.');
      s.gorevler = s.gorevler.filter((x) => x.id !== g.id);
      return { durum: 204 };
    }
    if (i.yontem === 'PATCH') {
      if (g.durum === 'devredildi')
        return hata(409, 'gorev_zaten_devredildi', 'Görev devredilmiş.');
      const b = nesne(i.govde);
      for (const alan of [
        'gun',
        'brans_kodu',
        'konu_id',
        'baslik',
        'hedef_turu',
        'hedef_miktar',
        'sira',
      ])
        if (alan in b) g[alan] = b[alan];
      g.surum += 1;
      return ok(g);
    }
  }
  return null;
}

// --- Deneme -------------------------------------------------------------------------------------

function kuralBul(s: Durum, ham: { kural_id?: unknown; kural_kodu?: unknown }): Kural | undefined {
  return s.kurallar.find((k) => k.id === ham.kural_id || k.kod === ham.kural_kodu);
}

interface BolumHatasi {
  kod: string;
  mesaj: string;
}

/** Bolum girdilerini dogrular; hata varsa ilk hatayi, yoksa tam bolum listesini dondurur. */
function bolumleriCoz(kural: Kural, ham: unknown): { hata: BolumHatasi } | { bolumler: Kayit[] } {
  if (!Array.isArray(ham) || ham.length === 0)
    return { hata: { kod: 'deneme_bolum_gecersiz', mesaj: 'Bölüm yok.' } };
  const bolumler: Kayit[] = [];
  for (const x of ham) {
    const b = nesne(x);
    const tanim = kural.bolumler.find((k) => k.bolum_kodu === b.bolum_kodu);
    if (!tanim)
      return {
        hata: { kod: 'deneme_bolum_gecersiz', mesaj: `Bilinmeyen bölüm: ${String(b.bolum_kodu)}.` },
      };
    const d = sayi(b.dogru);
    const y = sayi(b.yanlis);
    const bos = b.bos === undefined ? null : sayi(b.bos);
    if (d === null || y === null || (b.bos !== undefined && bos === null)) {
      return {
        hata: { kod: 'deneme_bolum_gecersiz', mesaj: `${tanim.ad}: sayılar tam sayı olmalı.` },
      };
    }
    if (d + y > tanim.soru_sayisi || (bos !== null && d + y + bos !== tanim.soru_sayisi)) {
      return {
        hata: {
          kod: 'deneme_bolum_gecersiz',
          mesaj: `${tanim.ad}: doğru + yanlış + boş ${String(tanim.soru_sayisi)} olmalı.`,
        },
      };
    }
    bolumler.push({
      bolum_kodu: tanim.bolum_kodu,
      brans_kodu: tanim.brans_kodu,
      soru_sayisi: tanim.soru_sayisi,
      dogru: d,
      yanlis: y,
      bos: tanim.soru_sayisi - d - y,
      net: netHesapla(d, y, kural.yanlis_katsayisi),
    });
  }
  return { bolumler };
}

function denemeGorunumu(kurumId: string, d: Deneme, gizleAd: boolean): Kayit {
  return { ...d, gorunen_ad: gizleAd ? null : adi(kurumId, d.ogrenci_id) };
}

function toplamNet(bolumler: Kayit[]): number {
  return yuvarla2(bolumler.reduce((t, b) => t + (b.net as number), 0));
}

function denemeOlustur(
  kurumId: string,
  kural: Kural,
  ogrenciId: string,
  ad: string,
  tarih: string,
  bolumler: Kayit[],
  ek: Kayit,
): Deneme {
  return {
    id: uid(),
    ogrenci_id: ogrenciId,
    kural_id: kural.id,
    kural_kodu: kural.kod,
    yanlis_katsayisi: kural.yanlis_katsayisi,
    ad,
    yayinevi: null,
    sinav_tarihi: tarih,
    toplam_net: toplamNet(bolumler),
    giren_id: kimlikler(kurumId).ogretmenId,
    kaynak: 'ogretmen',
    sure_dk: null,
    not: null,
    onay_durumu: 'onaylandi',
    onaylayan_id: null,
    onay_at: null,
    red_nedeni: null,
    surum: 1,
    created_at: simdi(),
    bolumler,
    ...ek,
  };
}

const ort = (xs: number[]) =>
  xs.length ? yuvarla2(xs.reduce((t, x) => t + x, 0) / xs.length) : null;

function gelisim(s: Durum, ogrenciId: string, kodu: string, limit: number): Kayit {
  const hepsi = s.denemeler
    .filter(
      (d) => d.ogrenci_id === ogrenciId && d.kural_kodu === kodu && d.onay_durumu === 'onaylandi',
    )
    .sort((a, b) => a.sinav_tarihi.localeCompare(b.sinav_tarihi));
  const son5 = hepsi.slice(-5);
  const onceki5 = hepsi.slice(-10, -5);
  const sonA = ort(son5.map((d) => d.toplam_net as number));
  const oncekiA = ort(onceki5.map((d) => d.toplam_net as number));
  const bolumKodlari = [
    ...new Set(hepsi.flatMap((d) => d.bolumler.map((b) => b.bolum_kodu as string))),
  ];
  return {
    ogrenci_id: ogrenciId,
    kural_kodu: kodu,
    deneme_sayisi: hepsi.length,
    noktalar: hepsi.slice(-limit).map((d) => ({
      deneme_id: d.id,
      ad: d.ad,
      sinav_tarihi: d.sinav_tarihi,
      toplam_net: d.toplam_net,
      bolumler: d.bolumler.map((b) => ({
        bolum_kodu: b.bolum_kodu,
        brans_kodu: b.brans_kodu,
        net: b.net,
      })),
    })),
    son5_sayisi: son5.length,
    son5_ortalama: sonA,
    onceki5_sayisi: onceki5.length,
    onceki5_ortalama: oncekiA,
    degisim: sonA !== null && oncekiA !== null ? yuvarla2(sonA - oncekiA) : null,
    bolum_gelisimi: bolumKodlari.map((bk) => {
      const netleri = (liste: Deneme[]) =>
        liste
          .map((d) => d.bolumler.find((b) => b.bolum_kodu === bk)?.net as number)
          .filter((x) => typeof x === 'number');
      const sA = ort(netleri(son5));
      const oA = ort(netleri(onceki5));
      const ilk = hepsi.flatMap((d) => d.bolumler).find((b) => b.bolum_kodu === bk);
      return {
        bolum_kodu: bk,
        brans_kodu: ilk?.brans_kodu,
        son5_ortalama: sA,
        onceki5_ortalama: oA,
        degisim: sA !== null && oA !== null ? yuvarla2(sA - oA) : null,
      };
    }),
  };
}

function sablonSatirlari(kurumId: string, kural: Kural, ogrenciler: string[]): Hucre[][] {
  const baslik: Hucre[] = ['ogrenci_id', 'ogrenci_no', 'ad'];
  for (const b of kural.bolumler) baslik.push(`${b.bolum_kodu}_dogru`, `${b.bolum_kodu}_yanlis`);
  return [
    baslik,
    ...ogrenciler.map((id, n): Hucre[] => [id, String(n + 1), adi(kurumId, id) ?? '']),
  ];
}

function topluHatasi(hatalar: Kayit[]): MockYanit {
  return hata(422, 'toplu_giris_hatali', 'Bazı satırlarda hata var.', { hatalar });
}

function denemeIsle(s: Durum, kurumId: string, p: string[], i: MockIstek): MockYanit | null {
  const personel = personelMi(kurumId);
  const { benId } = kimlikler(kurumId);

  if (p[0] === 'deneme-kurallari' && i.yontem === 'GET') {
    const aktif = i.sorgu.get('aktif');
    return ok({ kurallar: s.kurallar.filter((k) => aktif === null || String(k.aktif) === aktif) });
  }
  if (p[0] === 'deneme-ayarlari') {
    if (i.yontem === 'GET') return ok(s.ayarlar);
    if (i.yontem === 'PUT') {
      if (!yonetimMi(kurumId)) return izinYok();
      const g = nesne(i.govde);
      if (typeof g.ogrenci_deneme_girisi !== 'boolean') return dogrulama();
      s.ayarlar.ogrenci_deneme_girisi = g.ogrenci_deneme_girisi;
      return ok(s.ayarlar);
    }
    return null;
  }
  if (p[0] === 'denemelerim' && i.yontem === 'GET') {
    if (personel) return izinYok();
    const liste = s.denemeler
      .filter(
        (d) =>
          d.ogrenci_id === benId &&
          (!i.sorgu.get('kural') || d.kural_kodu === i.sorgu.get('kural')),
      )
      .sort((a, b) => b.sinav_tarihi.localeCompare(a.sinav_tarihi));
    const { dilim, sonraki } = sayfala(liste, i.sorgu);
    return ok({
      denemeler: dilim.map((d) => denemeGorunumu(kurumId, d, true)),
      sonraki_imlec: sonraki,
    });
  }
  if (p[0] === 'ogrenciler' && p[2] === 'deneme-gelisim' && i.yontem === 'GET') {
    if (!personel && p[1] !== benId) return bulunamadi();
    const kural = i.sorgu.get('kural');
    if (!kural) return dogrulama();
    return ok(gelisim(s, ilk(p[1]), kural, Number(i.sorgu.get('limit') ?? 20) || 20));
  }
  if (p[0] === 'gruplar' && p[2] === 'deneme-ozet' && i.yontem === 'GET') {
    if (!personel) return izinYok();
    const kural = i.sorgu.get('kural');
    if (!kural) return dogrulama();
    const ogrenciler = grupOgrencileri(kurumId, ilk(p[1]));
    const satirlar = ogrenciler.map((id) => {
      const g = gelisim(s, id, kural, 20);
      const noktalar = g.noktalar as { toplam_net: number }[];
      return {
        ogrenci_id: id,
        gorunen_ad: adi(kurumId, id),
        deneme_sayisi: g.deneme_sayisi as number,
        son_net: noktalar.length
          ? (noktalar[noktalar.length - 1] as { toplam_net: number }).toplam_net
          : null,
        son5_ortalama: g.son5_ortalama as number | null,
      };
    });
    const ortalamalar = satirlar.map((x) => x.son5_ortalama).filter((x): x is number => x !== null);
    const kuralTanimi = s.kurallar.find((k) => k.kod === kural);
    return ok({
      grup_id: p[1],
      kural_kodu: kural,
      ogrenci_sayisi: ogrenciler.length,
      denemesi_olan_sayisi: satirlar.filter((x) => x.deneme_sayisi > 0).length,
      sinif_ortalamasi: ort(ortalamalar),
      bolum_ortalamalari: (kuralTanimi?.bolumler ?? []).flatMap((b) => {
        const netler = ogrenciler
          .map(
            (id) =>
              (
                gelisim(s, id, kural, 20).bolum_gelisimi as {
                  bolum_kodu: string;
                  son5_ortalama: number | null;
                }[]
              ).find((x) => x.bolum_kodu === b.bolum_kodu)?.son5_ortalama,
          )
          .filter((x): x is number => typeof x === 'number');
        const o = ort(netler);
        return o === null
          ? []
          : [{ bolum_kodu: b.bolum_kodu, brans_kodu: b.brans_kodu, ortalama: o }];
      }),
      ogrenciler: satirlar,
    });
  }

  if (p[0] !== 'denemeler') return null;

  if (p[1] === 'sablon.xlsx' && i.yontem === 'GET') {
    if (!personel) return izinYok();
    const kural = s.kurallar.find((k) => k.kod === i.sorgu.get('kural'));
    if (!kural) return dogrulama();
    const grupId = i.sorgu.get('grup_id');
    const ogrenciler = grupId
      ? grupOgrencileri(kurumId, grupId)
      : kimlikler(kurumId).ogrenciler.map((u) => u.uyelik_id);
    return {
      durum: 200,
      ikili: {
        bayt: xlsxYaz(sablonSatirlari(kurumId, kural, ogrenciler)),
        tur: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dosyaAdi: `deneme-sablonu-${kural.kod}.xlsx`,
      },
    };
  }

  if (p[1] === 'excel' && i.yontem === 'POST') {
    if (!personel) return izinYok();
    const kural = s.kurallar.find((k) => k.kod === i.sorgu.get('kural'));
    const ad = metin(i.sorgu.get('ad'));
    const tarih = metin(i.sorgu.get('sinav_tarihi'));
    if (!kural || !ad || !tarih || !TARIH.test(tarih)) return dogrulama();
    const satirlar = i.ikili ? xlsxOku(i.ikili) : null;
    if (!satirlar || satirlar.length === 0) {
      return hata(422, 'excel_gecersiz', 'Dosya geçerli bir Excel dosyası değil.');
    }
    const baslik = satirlar[0] ?? [];
    const sutun = (ad2: string) => baslik.indexOf(ad2);
    const ogrIdSutun = sutun('ogrenci_id');
    if (ogrIdSutun < 0) return hata(422, 'excel_gecersiz', 'ogrenci_id sütunu bulunamadı.');
    const gecerliOgrenci = new Set(kimlikler(kurumId).ogrenciler.map((u) => u.uyelik_id));
    const hatalar: Kayit[] = [];
    const yeniler: { ogrenciId: string; bolumler: Kayit[] }[] = [];
    let atlanan = 0;
    satirlar.slice(1).forEach((satir, n) => {
      const sayfaSatiri = n + 2;
      const ogrenciId = typeof satir[ogrIdSutun] === 'string' ? satir[ogrIdSutun] : null;
      if (!ogrenciId || !gecerliOgrenci.has(ogrenciId)) {
        hatalar.push({
          satir: sayfaSatiri,
          ogrenci_id: null,
          kod: 'ogrenci_bulunamadi',
          mesaj: 'Öğrenci bulunamadı.',
        });
        return;
      }
      const ham = kural.bolumler.map(
        (b) =>
          [
            satir[sutun(`${b.bolum_kodu}_dogru`)] ?? null,
            satir[sutun(`${b.bolum_kodu}_yanlis`)] ?? null,
          ] as const,
      );
      if (ham.every(([d, y]) => d === null && y === null)) {
        atlanan += 1;
        return;
      }
      const bolumHamlari: Kayit[] = [];
      for (const [bi, [d, y]] of ham.entries()) {
        const b = ilk(kural.bolumler[bi]);
        if (typeof d === 'string' || typeof y === 'string') {
          hatalar.push({
            satir: sayfaSatiri,
            ogrenci_id: ogrenciId,
            kod: 'deneme_bolum_gecersiz',
            mesaj: `${b.ad}: sayı ya da formül olmayan değer.`,
          });
          return;
        }
        bolumHamlari.push({ bolum_kodu: b.bolum_kodu, dogru: d ?? 0, yanlis: y ?? 0 });
      }
      const cozulmus = bolumleriCoz(kural, bolumHamlari);
      if ('hata' in cozulmus) {
        hatalar.push({ satir: sayfaSatiri, ogrenci_id: ogrenciId, ...cozulmus.hata });
        return;
      }
      yeniler.push({ ogrenciId, bolumler: cozulmus.bolumler });
    });
    if (hatalar.length > 0) return topluHatasi(hatalar);
    const olusan = yeniler.map((y) => {
      const d = denemeOlustur(kurumId, kural, y.ogrenciId, ad, tarih, y.bolumler, {});
      s.denemeler.push(d);
      return { deneme_id: d.id, ogrenci_id: d.ogrenci_id, toplam_net: d.toplam_net };
    });
    return ok(
      { olusturulan_sayisi: olusan.length, atlanan_satir_sayisi: atlanan, denemeler: olusan },
      201,
    );
  }

  if (p[1] === 'toplu' && i.yontem === 'POST') {
    if (!personel) return izinYok();
    const g = nesne(i.govde);
    const kural = kuralBul(s, g);
    const ad = metin(g.ad);
    const tarih = metin(g.sinav_tarihi);
    if (
      !kural ||
      !ad ||
      !tarih ||
      !TARIH.test(tarih) ||
      !Array.isArray(g.satirlar) ||
      g.satirlar.length === 0
    )
      return dogrulama();
    const hatalar: Kayit[] = [];
    const yeniler: { ogrenciId: string; bolumler: Kayit[] }[] = [];
    g.satirlar.forEach((x, n) => {
      const satir = nesne(x);
      const ogrenciId = metin(satir.ogrenci_id) ?? '';
      const c = bolumleriCoz(kural, satir.bolumler);
      if ('hata' in c) hatalar.push({ satir: n, ogrenci_id: ogrenciId || null, ...c.hata });
      else yeniler.push({ ogrenciId, bolumler: c.bolumler });
    });
    if (hatalar.length > 0) return topluHatasi(hatalar);
    const olusan = yeniler.map((y) => {
      const d = denemeOlustur(kurumId, kural, y.ogrenciId, ad, tarih, y.bolumler, {});
      s.denemeler.push(d);
      return { deneme_id: d.id, ogrenci_id: d.ogrenci_id, toplam_net: d.toplam_net };
    });
    return ok(
      { olusturulan_sayisi: olusan.length, atlanan_satir_sayisi: 0, denemeler: olusan },
      201,
    );
  }

  if (p.length === 1 && i.yontem === 'POST') {
    const g = nesne(i.govde);
    const kural = kuralBul(s, g);
    const ad = metin(g.ad);
    const tarih = metin(g.sinav_tarihi);
    if (!kural || !ad || !tarih || !TARIH.test(tarih)) return dogrulama();
    const ogrenciMi = !personel;
    if (ogrenciMi && !s.ayarlar.ogrenci_deneme_girisi) {
      return hata(403, 'ogrenci_deneme_girisi_kapali', 'Öğrenci girişi kapalı.');
    }
    const ogrenciId = ogrenciMi ? benId : metin(g.ogrenci_id);
    if (!ogrenciId) return dogrulama();
    const c = bolumleriCoz(kural, g.bolumler);
    if ('hata' in c) return hata(422, c.hata.kod, c.hata.mesaj);
    if (
      s.denemeler.some((d) => d.ogrenci_id === ogrenciId && d.ad === ad && d.sinav_tarihi === tarih)
    ) {
      return hata(409, 'deneme_zaten_var', 'Bu deneme zaten girilmiş.');
    }
    const d = denemeOlustur(kurumId, kural, ogrenciId, ad, tarih, c.bolumler, {
      kaynak: ogrenciMi ? 'ogrenci' : 'ogretmen',
      onay_durumu: ogrenciMi ? 'bekliyor' : 'onaylandi',
      giren_id: ogrenciMi ? benId : kimlikler(kurumId).ogretmenId,
      yayinevi: metin(g.yayinevi),
      not: metin(g.not),
    });
    s.denemeler.push(d);
    return ok(denemeGorunumu(kurumId, d, ogrenciMi), 201);
  }
  if (p.length === 1 && i.yontem === 'GET') {
    if (!personel) return izinYok();
    const onay = i.sorgu.get('onay');
    const ogr = i.sorgu.get('ogrenci_id');
    const kuralKodu = i.sorgu.get('kural');
    const liste = s.denemeler
      .filter(
        (d) =>
          (!onay || d.onay_durumu === onay) &&
          (!ogr || d.ogrenci_id === ogr) &&
          (!kuralKodu || d.kural_kodu === kuralKodu),
      )
      .sort(
        (a, b) =>
          b.sinav_tarihi.localeCompare(a.sinav_tarihi) || b.created_at.localeCompare(a.created_at),
      );
    const { dilim, sonraki } = sayfala(liste, i.sorgu);
    return ok({
      denemeler: dilim.map((d) => denemeGorunumu(kurumId, d, false)),
      sonraki_imlec: sonraki,
    });
  }

  const d = s.denemeler.find((x) => x.id === p[1]);
  if (!d) return bulunamadi();
  if (!personel && d.ogrenci_id !== benId) return bulunamadi();
  if (p.length === 2 && i.yontem === 'GET') return ok(denemeGorunumu(kurumId, d, !personel));
  if (p[2] === 'onay' && i.yontem === 'POST') {
    if (!personel) return izinYok();
    if (d.onay_durumu === 'bekliyor')
      Object.assign(d, { onay_durumu: 'onaylandi', onay_at: simdi(), red_nedeni: null });
    return ok(denemeGorunumu(kurumId, d, false));
  }
  if (p[2] === 'red' && i.yontem === 'POST') {
    if (!personel) return izinYok();
    const neden = metin(nesne(i.govde).red_nedeni);
    if (!neden) return dogrulama();
    if (d.onay_durumu === 'onaylandi')
      return hata(409, 'deneme_onay_durumu_gecersiz', 'Onaylanmış deneme reddedilemez.');
    Object.assign(d, { onay_durumu: 'reddedildi', red_nedeni: neden, onay_at: simdi() });
    return ok(denemeGorunumu(kurumId, d, false));
  }
  if (p.length === 2 && i.yontem === 'DELETE') {
    if (!personel && !s.ayarlar.ogrenci_deneme_girisi)
      return hata(403, 'ogrenci_deneme_girisi_kapali', 'Öğrenci girişi kapalı.');
    s.denemeler = s.denemeler.filter((x) => x.id !== d.id);
    return { durum: 204 };
  }
  return null;
}

// --- Giris --------------------------------------------------------------------------------------

export function ogrenmeMock(istek: MockIstek): MockYanit {
  const parcalar = istek.yol.split('/');
  if (parcalar[0] !== 'kurumlar' || !parcalar[1] || !(parcalar[1] in MOCK_KURUM_ROLLERI)) {
    return bulunamadi();
  }
  const kurumId = parcalar[1];
  const s = durum(kurumId);
  const kalan = parcalar.slice(2);
  return (
    mufredatIsle(s, kurumId, kalan, istek) ??
    odevIsle(s, kurumId, kalan, istek) ??
    planIsle(s, kurumId, kalan, istek) ??
    denemeIsle(s, kurumId, kalan, istek) ??
    bulunamadi()
  );
}
