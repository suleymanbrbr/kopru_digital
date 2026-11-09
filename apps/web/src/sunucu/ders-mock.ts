import { finansKrediUygula } from './finans-mock';
import { MOCK_KURUM_ROLLERI, mockKurumVerisi } from './hesap-mock';
import type { MockIstek, MockYanit } from './vekil';

/**
 * `NEXT_PUBLIC_API_MOCK=1` iken `/api/ders/*` ucunun bellek ici karsiligi: takvim, seri, ders
 * islemleri ve yoklama. Yanit sekilleri `@kopru/contracts` ile aynidir. Gruplar, uyeler ve
 * atamalar `hesap-mock`tan gelir. Saat dilimi sabit UTC+3 (Europe/Istanbul). Yalniz deneme ve e2e icindir.
 */

type Kayit = Record<string, unknown>;

interface Ders extends Kayit {
  id: string;
  grup_id: string;
  seri_id: string | null;
  seri_sirasi: number | null;
  ogretmen_id: string;
  baslangic_at: string;
  bitis_at: string;
  durum: 'planli' | 'tamamlandi' | 'iptal';
  seri_istisna: boolean;
  surum: number;
  katilimcilar: string[];
}

interface DersDurumu {
  dersler: Ders[];
  seriler: Kayit[];
  /** `dersId/ogrenciId` -> yoklama satiri. */
  yoklamalar: Map<string, Kayit>;
  idempotency: Map<string, { govde: string; yanit: MockYanit }>;
}

const hata = (durum: number, kod: string, mesaj: string, details?: unknown): MockYanit => ({
  durum,
  govde: { error: { code: kod, message: mesaj, ...(details === undefined ? {} : { details }) } },
});

const uid = () => crypto.randomUUID();
const SAAT_MS = 3_600_000;
const GUN_MS = 86_400_000;
const UTC3_MS = 3 * SAAT_MS;

/** Yerel (UTC+3) tarih + saat -> UTC ISO. */
function yerelUtc(tarih: string, saat: string): string {
  const [y, a, g] = tarih.split('-').map(Number);
  const [sa, dk] = saat.split(':').map(Number);
  return new Date(Date.UTC(y ?? 1970, (a ?? 1) - 1, g ?? 1, (sa ?? 0) - 3, dk ?? 0)).toISOString();
}
function yerelTarih(iso: string): string {
  return new Date(Date.parse(iso) + UTC3_MS).toISOString().slice(0, 10);
}
function yerelSaat(iso: string): string {
  return new Date(Date.parse(iso) + UTC3_MS).toISOString().slice(11, 16);
}
function gunEkle(tarih: string, gun: number): string {
  return new Date(Date.parse(`${tarih}T00:00:00Z`) + gun * GUN_MS).toISOString().slice(0, 10);
}
/** 0 = Pazartesi. */
function haftaGunu(tarih: string): number {
  return (new Date(`${tarih}T00:00:00Z`).getUTCDay() + 6) % 7;
}
const GUN_KODLARI = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

const kutu = globalThis as unknown as { __kopruDersMock?: Record<string, DersDurumu> };

/** Testler: tum ders verisini bastan kurar. */
export function dersMockSifirla(): void {
  kutu.__kopruDersMock = undefined;
}

function rolu(kurumId: string) {
  return MOCK_KURUM_ROLLERI[kurumId];
}

/** Rol -> kendini temsil eden uye: deneme ogretmeni ve ogrencisi sabittir. */
function kimlikler(kurumId: string) {
  const v = mockKurumVerisi(kurumId);
  const ogretmen = v.uyeler.find((u) => u.rol === 'ogretmen');
  const ogrenciler = v.uyeler.filter((u) => u.rol === 'ogrenci');
  return { v, ogretmenId: ogretmen?.uyelik_id ?? uid(), ogrenciId: ogrenciler[1]?.uyelik_id ?? '' };
}

function grupKatilimcilari(kurumId: string, grupId: string): string[] {
  const { v } = kimlikler(kurumId);
  return (v.grupUyeleri[grupId] ?? [])
    .filter((u) => u.bitis_tarihi === null)
    .map((u) => u.ogrenci_id as string);
}

function dersYap(
  kurumId: string,
  grupId: string,
  baslangic: string,
  sureDk: number,
  ek: Partial<Ders> = {},
): Ders {
  const { ogretmenId } = kimlikler(kurumId);
  return {
    id: uid(),
    grup_id: grupId,
    seri_id: null,
    seri_sirasi: null,
    ogretmen_id: ogretmenId,
    brans_kodu: 'matematik',
    konu_id: null,
    baslik: null,
    baslangic_at: baslangic,
    bitis_at: new Date(Date.parse(baslangic) + sureDk * 60_000).toISOString(),
    durum: 'planli',
    iptal_nedeni: null,
    iptal_kaynagi: null,
    iptal_eden_id: null,
    iptal_at: null,
    gec_iptal: false,
    ilk_baslangic_at: baslangic,
    ertelendi_sayisi: 0,
    telafi: false,
    telafi_kaynak_ders_id: null,
    seri_istisna: false,
    online_baglanti: null,
    yer: null,
    cakisma_onayli: false,
    surum: 1,
    created_at: new Date().toISOString(),
    katilimcilar: grupKatilimcilari(kurumId, grupId),
    ...ek,
  };
}

function kur(kurumId: string): DersDurumu {
  const { v } = kimlikler(kurumId);
  const sinif = v.gruplar.find((g) => g.tur === 'sinif');
  const birebir = v.gruplar.find((g) => g.tur === 'birebir');
  const grup = v.gruplar.find((g) => g.tur === 'grup');
  const dersler: Ders[] = [];
  const simdi = Date.now();
  const bugun = yerelTarih(new Date(simdi).toISOString());
  const pazartesi = gunEkle(bugun, -haftaGunu(bugun));
  if (sinif) {
    // Bu haftanin sali/persembe 16:00 sinif dersi (seri).
    const seriId = uid();
    for (const [i, gun] of [1, 3, 8, 10].entries()) {
      dersler.push(
        dersYap(kurumId, sinif.id, yerelUtc(gunEkle(pazartesi, gun), '16:00'), 60, {
          seri_id: seriId,
          seri_sirasi: i + 1,
          baslik: 'Üslü sayılar',
          online_baglanti: i === 0 ? 'https://meet.ornek.test/uslu' : null,
        }),
      );
    }
  }
  if (birebir) {
    // Yoklama bekleyenler: bundan 26 ve 3 saat once baslamis dersler.
    dersler.push(
      dersYap(kurumId, birebir.id, new Date(simdi - 26 * SAAT_MS).toISOString(), 45, {
        baslik: 'Problemler',
      }),
    );
    dersler.push(
      dersYap(kurumId, birebir.id, new Date(simdi + 26 * SAAT_MS).toISOString(), 45, {
        yer: 'Çalışma odası 2',
      }),
    );
  }
  if (sinif) {
    dersler.push(
      dersYap(kurumId, sinif.id, new Date(simdi - 3 * SAAT_MS).toISOString(), 60, {
        baslik: 'Denklemler',
      }),
    );
  }
  if (grup) {
    dersler.push(
      dersYap(kurumId, grup.id, new Date(simdi + 2 * SAAT_MS).toISOString(), 90, {
        brans_kodu: 'fen_bilimleri',
        online_baglanti: 'https://meet.ornek.test/lgs',
      }),
    );
  }
  return { dersler, seriler: [], yoklamalar: new Map(), idempotency: new Map() };
}

function durum(kurumId: string): DersDurumu {
  kutu.__kopruDersMock ??= {};
  kutu.__kopruDersMock[kurumId] ??= kur(kurumId);
  return kutu.__kopruDersMock[kurumId];
}

// --- Gorunum ---------------------------------------------------------------------------------

function dersGorunumu(d: Ders): Kayit {
  const { katilimcilar: _k, ...kalan } = d;
  return { ...kalan, katilimci_sayisi: d.katilimcilar.length };
}

function adi(kurumId: string, ogrenciId: string): string | null {
  const u = mockKurumVerisi(kurumId).uyeler.find((x) => x.uyelik_id === ogrenciId);
  return u ? u.gorunen_ad : null;
}

function dersDetayi(kurumId: string, d: Ders): Kayit {
  const { ogrenciId } = kimlikler(kurumId);
  const ogrenciMi = rolu(kurumId) === 'ogrenci';
  return {
    ...dersGorunumu(d),
    katilimcilar: d.katilimcilar
      .filter((o) => !ogrenciMi || o === ogrenciId)
      .map((o) => ({ ogrenci_id: o, tur: 'uye', gorunen_ad: adi(kurumId, o) })),
  };
}

function gorunenDersler(kurumId: string, s: DersDurumu): Ders[] {
  const { ogretmenId, ogrenciId } = kimlikler(kurumId);
  const rol = rolu(kurumId);
  if (rol === 'ogretmen') return s.dersler.filter((d) => d.ogretmen_id === ogretmenId);
  if (rol === 'ogrenci') return s.dersler.filter((d) => d.katilimcilar.includes(ogrenciId));
  return s.dersler;
}

function cakisanlar(s: DersDurumu, ogretmenId: string, bas: string, bit: string, haric: string[]) {
  return s.dersler.filter(
    (d) =>
      d.ogretmen_id === ogretmenId &&
      d.durum === 'planli' &&
      !d.cakisma_onayli &&
      !haric.includes(d.id) &&
      Date.parse(d.baslangic_at) < Date.parse(bit) &&
      Date.parse(d.bitis_at) > Date.parse(bas),
  );
}

function cakismaOzeti(d: Ders): Kayit {
  return {
    id: d.id,
    grup_id: d.grup_id,
    baslik: d.baslik,
    baslangic_at: d.baslangic_at,
    bitis_at: d.bitis_at,
  };
}

function ogrenciUyarilari(s: DersDurumu, yeni: Ders, haric: string[] = []): Kayit[] {
  const uyarilar: Kayit[] = [];
  for (const d of s.dersler) {
    if (d.id === yeni.id || haric.includes(d.id) || d.durum !== 'planli') continue;
    if (!(Date.parse(d.baslangic_at) < Date.parse(yeni.bitis_at))) continue;
    if (!(Date.parse(d.bitis_at) > Date.parse(yeni.baslangic_at))) continue;
    const ortak = d.katilimcilar.filter((o) => yeni.katilimcilar.includes(o));
    if (ortak.length > 0 && d.ogretmen_id !== yeni.ogretmen_id) {
      uyarilar.push({
        kod: 'ogrenci_cakismasi',
        ders_id: yeni.id,
        cakisan_ders_id: d.id,
        ogrenci_idleri: ortak,
      });
    }
  }
  return uyarilar;
}

function govdeNesnesi(govde: unknown): Kayit {
  return typeof govde === 'object' && govde !== null ? (govde as Kayit) : {};
}

const dogrulama = (m = 'İstek doğrulanamadı.') => hata(400, 'dogrulama_hatasi', m);
const bulunamadi = () => hata(404, 'bulunamadi', 'Kaynak bulunamadı.');
const izinYok = () => hata(403, 'izin_yok', 'Bu işlem için yetkin yok.');

// --- Yazma -----------------------------------------------------------------------------------

function dersOlustur(kurumId: string, s: DersDurumu, g: Kayit): MockYanit {
  const grupId = g.grup_id;
  const tarih = g.tarih;
  const saat = g.baslangic_saati;
  const sure = g.sure_dk;
  if (
    typeof grupId !== 'string' ||
    typeof tarih !== 'string' ||
    typeof saat !== 'string' ||
    typeof sure !== 'number'
  ) {
    return dogrulama();
  }
  const v = mockKurumVerisi(kurumId);
  if (!v.gruplar.some((x) => x.id === grupId)) return bulunamadi();
  const bas = yerelUtc(tarih, saat);
  const { ogretmenId } = kimlikler(kurumId);
  const ogretmen = typeof g.ogretmen_id === 'string' ? g.ogretmen_id : ogretmenId;
  const ders = dersYap(kurumId, grupId, bas, sure, {
    ogretmen_id: ogretmen,
    brans_kodu: typeof g.brans_kodu === 'string' ? g.brans_kodu : 'matematik',
    baslik: typeof g.baslik === 'string' ? g.baslik : null,
    online_baglanti: typeof g.online_baglanti === 'string' ? g.online_baglanti : null,
    yer: typeof g.yer === 'string' ? g.yer : null,
    telafi: g.telafi === true,
  });
  const cak = cakisanlar(s, ders.ogretmen_id, ders.baslangic_at, ders.bitis_at, []);
  const onayli = g.cakisma_onayli === true;
  if (cak.length > 0 && !onayli) {
    return hata(409, 'ders_cakismasi', 'Bu saatte öğretmenin başka dersi var.', {
      cakisanlar: cak.map(cakismaOzeti),
    });
  }
  if (cak.length > 0) ders.cakisma_onayli = true;
  const uyari = ogrenciUyarilari(s, ders);
  s.dersler.push(ders);
  return { durum: 201, govde: { ders: dersDetayi(kurumId, ders), uyari } };
}

function seriOlustur(kurumId: string, s: DersDurumu, g: Kayit): MockYanit {
  const grupId = g.grup_id;
  const kural = g.tekrar_kurali;
  const baslangic = g.baslangic_tarihi;
  const saat = g.baslangic_saati;
  const sure = g.sure_dk;
  if (
    typeof grupId !== 'string' ||
    typeof kural !== 'string' ||
    typeof baslangic !== 'string' ||
    typeof saat !== 'string' ||
    typeof sure !== 'number'
  ) {
    return dogrulama();
  }
  const v = mockKurumVerisi(kurumId);
  if (!v.gruplar.some((x) => x.id === grupId)) return bulunamadi();
  const bydayMetni = /BYDAY=([A-Z,]+)/.exec(kural)?.[1];
  const gunler = bydayMetni
    ? bydayMetni.split(',').map((x) => GUN_KODLARI.indexOf(x))
    : [haftaGunu(baslangic)];
  const aralik = Number(/INTERVAL=(\d+)/.exec(kural)?.[1] ?? '1');
  const bugun = yerelTarih(new Date().toISOString());
  const ilkGun = baslangic > bugun ? baslangic : bugun;
  const ufuk = gunEkle(ilkGun, 84);
  const bitis = typeof g.bitis_tarihi === 'string' ? g.bitis_tarihi : null;
  const adet = typeof g.adet === 'number' ? g.adet : null;
  const son = bitis && bitis < ufuk ? bitis : ufuk;
  const { ogretmenId } = kimlikler(kurumId);
  const seriId = uid();
  const aday: { tarih: string }[] = [];
  const baslangicPzt = gunEkle(baslangic, -haftaGunu(baslangic));
  for (let gun = baslangic; gun <= son; gun = gunEkle(gun, 1)) {
    const hafta = Math.floor(
      (Date.parse(`${gunEkle(gun, -haftaGunu(gun))}T00:00:00Z`) -
        Date.parse(`${baslangicPzt}T00:00:00Z`)) /
        (7 * GUN_MS),
    );
    if (hafta % aralik === 0 && gunler.includes(haftaGunu(gun))) aday.push({ tarih: gun });
    if (adet !== null && aday.length >= adet) break;
  }
  const yeniler = aday.map((a, i) =>
    dersYap(kurumId, grupId, yerelUtc(a.tarih, saat), sure, {
      seri_id: seriId,
      seri_sirasi: i + 1,
      ogretmen_id: typeof g.ogretmen_id === 'string' ? g.ogretmen_id : ogretmenId,
      brans_kodu: typeof g.brans_kodu === 'string' ? g.brans_kodu : 'matematik',
      baslik: typeof g.baslik === 'string' ? g.baslik : null,
      online_baglanti: typeof g.online_baglanti === 'string' ? g.online_baglanti : null,
      yer: typeof g.yer === 'string' ? g.yer : null,
    }),
  );
  const tumCakisanlar = new Map<string, Ders>();
  for (const d of yeniler) {
    for (const c of cakisanlar(s, d.ogretmen_id, d.baslangic_at, d.bitis_at, [])) {
      tumCakisanlar.set(c.id, c);
    }
  }
  const onayli = g.cakisma_onayli === true;
  if (tumCakisanlar.size > 0 && !onayli) {
    return hata(409, 'ders_cakismasi', 'Bu saatlerde öğretmenin başka dersi var.', {
      cakisanlar: [...tumCakisanlar.values()].map(cakismaOzeti),
    });
  }
  const yazilacak = yeniler.map((d) => {
    const cak = cakisanlar(s, d.ogretmen_id, d.baslangic_at, d.bitis_at, []).length > 0;
    return cak ? { ...d, cakisma_onayli: true } : d;
  });
  s.dersler.push(...yazilacak);
  const seri = {
    id: seriId,
    grup_id: grupId,
    ogretmen_id: yeniler[0]?.ogretmen_id ?? ogretmenId,
    brans_kodu: typeof g.brans_kodu === 'string' ? g.brans_kodu : 'matematik',
    baslik: typeof g.baslik === 'string' ? g.baslik : null,
    tekrar_kurali: kural,
    baslangic_tarihi: baslangic,
    bitis_tarihi: bitis,
    adet,
    baslangic_saati: saat,
    sure_dk: sure,
    saat_dilimi: 'Europe/Istanbul',
    online_baglanti: typeof g.online_baglanti === 'string' ? g.online_baglanti : null,
    yer: typeof g.yer === 'string' ? g.yer : null,
    uretildi_son_tarih: son,
    durum: 'aktif',
    surum: 1,
  };
  s.seriler.push(seri);
  return {
    durum: 201,
    govde: {
      seri,
      dersler: yazilacak.map(dersGorunumu),
      atlanan: [],
      cakisanlar: [...tumCakisanlar.values()].map(cakismaOzeti),
      uyari: yazilacak.flatMap((d) => ogrenciUyarilari(s, d)),
    },
  };
}

function etkilenenler(s: DersDurumu, d: Ders, kapsam: unknown): Ders[] {
  if (kapsam !== 'bu_ve_sonrakiler' || d.seri_id === null) return [d];
  return s.dersler.filter(
    (x) =>
      x.seri_id === d.seri_id &&
      x.durum === 'planli' &&
      (x.id === d.id || ((x.seri_sirasi ?? 0) > (d.seri_sirasi ?? 0) && !x.seri_istisna)),
  );
}

function guncelle(kurumId: string, s: DersDurumu, d: Ders, g: Kayit): MockYanit {
  if (g.surum !== d.surum) {
    return hata(
      409,
      'surum_cakismasi',
      'Ders başka biri tarafından değiştirilmiş. Yenileyip tekrar dene.',
    );
  }
  if (g.kapsam === 'bu_ve_sonrakiler' && d.seri_id === null) {
    return hata(422, 'ders_seride_degil', 'Bu ders bir seriye bağlı değil.');
  }
  const hedefler = etkilenenler(s, d, g.kapsam);
  for (const h of hedefler) {
    for (const alan of ['baslik', 'konu_id', 'online_baglanti', 'yer'] as const) {
      if (g[alan] !== undefined) h[alan] = g[alan];
    }
    if (g.kapsam !== 'bu_ve_sonrakiler')
      h.seri_istisna = h.seri_id !== null ? true : h.seri_istisna;
    h.surum += 1;
  }
  return {
    durum: 200,
    govde: {
      ders: dersDetayi(kurumId, d),
      etkilenen_ders_idleri: hedefler.map((h) => h.id),
      uyari: [],
    },
  };
}

function tasi(kurumId: string, s: DersDurumu, d: Ders, g: Kayit): MockYanit {
  if (g.surum !== d.surum) {
    return hata(
      409,
      'surum_cakismasi',
      'Ders başka biri tarafından değiştirilmiş. Yenileyip tekrar dene.',
    );
  }
  if (d.durum !== 'planli') return hata(409, 'ders_planli_degil', 'Yalnız planlı dersler taşınır.');
  const yeniTarih = typeof g.yeni_tarih === 'string' ? g.yeni_tarih : null;
  const yeniSaat = typeof g.yeni_saat === 'string' ? g.yeni_saat : null;
  if (!yeniTarih && !yeniSaat) return dogrulama();
  if (g.kapsam === 'bu_ve_sonrakiler') {
    if (yeniTarih) {
      return hata(
        422,
        'tarih_degisikligi_yalniz_bu',
        'Gün değişikliği yalnızca bu dersi etkiler; seriyi taşımak için yalnız saati değiştir.',
      );
    }
    if (d.seri_id === null)
      return hata(422, 'ders_seride_degil', 'Bu ders bir seriye bağlı değil.');
  }
  const hedefler = etkilenenler(s, d, g.kapsam);
  const cak = hedefler.flatMap((h) => {
    const sure = Date.parse(h.bitis_at) - Date.parse(h.baslangic_at);
    const bas = yerelUtc(
      yeniTarih ?? yerelTarih(h.baslangic_at),
      yeniSaat ?? yerelSaat(h.baslangic_at),
    );
    return cakisanlar(
      s,
      h.ogretmen_id,
      bas,
      new Date(Date.parse(bas) + sure).toISOString(),
      hedefler.map((x) => x.id),
    );
  });
  if (cak.length > 0 && g.cakisma_onayli !== true) {
    return hata(409, 'ders_cakismasi', 'Bu saatte öğretmenin başka dersi var.', {
      cakisanlar: [...new Map(cak.map((c) => [c.id, c])).values()].map(cakismaOzeti),
    });
  }
  for (const h of hedefler) {
    const sure = Date.parse(h.bitis_at) - Date.parse(h.baslangic_at);
    h.baslangic_at = yerelUtc(
      yeniTarih ?? yerelTarih(h.baslangic_at),
      yeniSaat ?? yerelSaat(h.baslangic_at),
    );
    h.bitis_at = new Date(Date.parse(h.baslangic_at) + sure).toISOString();
    h.ertelendi_sayisi = (h.ertelendi_sayisi as number) + 1;
    if (g.kapsam !== 'bu_ve_sonrakiler') h.seri_istisna = h.seri_id !== null;
    if (cak.length > 0) h.cakisma_onayli = true;
    h.surum += 1;
  }
  return {
    durum: 200,
    govde: {
      ders: dersDetayi(kurumId, d),
      etkilenen_ders_idleri: hedefler.map((h) => h.id),
      uyari: [],
    },
  };
}

function iptalEt(kurumId: string, s: DersDurumu, d: Ders, g: Kayit): MockYanit {
  const kaynak = g.iptal_kaynagi;
  if (kaynak !== 'ogretmen' && kaynak !== 'ogrenci' && kaynak !== 'yonetici') return dogrulama();
  const v = mockKurumVerisi(kurumId);
  const grup = v.gruplar.find((x) => x.id === d.grup_id);
  if (kaynak === 'ogrenci' && grup?.tur !== 'birebir') {
    return hata(
      422,
      'iptal_kaynagi_gecersiz',
      'Öğrenci kaynaklı iptal yalnız birebir derste olur.',
    );
  }
  if (g.surum !== undefined && g.surum !== d.surum) {
    return hata(
      409,
      'surum_cakismasi',
      'Ders başka biri tarafından değiştirilmiş. Yenileyip tekrar dene.',
    );
  }
  if (d.durum === 'iptal') return hata(409, 'ders_planli_degil', 'Bu ders zaten iptal edilmiş.');
  const hedefler = etkilenenler(s, d, g.kapsam);
  const { ogretmenId } = kimlikler(kurumId);
  for (const h of hedefler) {
    h.durum = 'iptal';
    h.iptal_nedeni = typeof g.iptal_nedeni === 'string' ? g.iptal_nedeni : null;
    h.iptal_kaynagi = kaynak;
    h.iptal_eden_id = ogretmenId;
    h.iptal_at = new Date().toISOString();
    h.gec_iptal = Date.parse(h.baslangic_at) - Date.now() < 24 * SAAT_MS;
    h.surum += 1;
  }
  return {
    durum: 200,
    govde: {
      ders: dersDetayi(kurumId, d),
      etkilenen_ders_idleri: hedefler.map((h) => h.id),
      uyari: [],
    },
  };
}

// --- Yoklama ---------------------------------------------------------------------------------

function yoklamaSatiri(kurumId: string, s: DersDurumu, d: Ders, ogrenciId: string): Kayit | null {
  const y = s.yoklamalar.get(`${d.id}/${ogrenciId}`);
  if (!y) return null;
  if (rolu(kurumId) === 'ogrenci' && y.not_gorunurluk !== 'ogrenciye') return { ...y, not: null };
  return y;
}

function yoklamaListesi(kurumId: string, s: DersDurumu, d: Ders): MockYanit {
  const { ogrenciId } = kimlikler(kurumId);
  const ogrenciMi = rolu(kurumId) === 'ogrenci';
  return {
    durum: 200,
    govde: {
      ders: {
        id: d.id,
        grup_id: d.grup_id,
        baslangic_at: d.baslangic_at,
        bitis_at: d.bitis_at,
        durum: d.durum,
      },
      katilimcilar: d.katilimcilar
        .filter((o) => !ogrenciMi || o === ogrenciId)
        .map((o) => ({
          ogrenci_id: o,
          tur: 'uye',
          gorunen_ad: adi(kurumId, o),
          yoklama: yoklamaSatiri(kurumId, s, d, o),
        })),
    },
  };
}

function yoklamaKaydet(kurumId: string, s: DersDurumu, d: Ders, istek: MockIstek): MockYanit {
  const anahtar = istek.basliklar['idempotency-key'];
  if (!anahtar) return dogrulama('Idempotency-Key başlığı zorunlu.');
  const ham = JSON.stringify(istek.govde ?? null);
  const onceki = s.idempotency.get(anahtar);
  if (onceki) {
    if (onceki.govde !== ham) {
      return hata(
        422,
        'idempotency_anahtar_cakismasi',
        'Bu anahtar başka bir istekle kullanılmış.',
      );
    }
    return onceki.yanit;
  }
  if (d.durum === 'iptal')
    return hata(409, 'ders_iptal_edildi', 'İptal edilmiş derse yoklama alınamaz.');
  if (Date.parse(d.baslangic_at) > Date.now() + 5 * 60_000) {
    return hata(422, 'ders_henuz_baslamadi', 'Ders henüz başlamadı.');
  }
  const satirlar = govdeNesnesi(istek.govde).yoklamalar;
  if (!Array.isArray(satirlar) || satirlar.length === 0) return dogrulama();
  const sonuclar: Kayit[] = [];
  for (const ham of satirlar) {
    const r = govdeNesnesi(ham);
    const ogrenciId = r.ogrenci_id;
    const durumu = r.durum;
    if (typeof ogrenciId !== 'string' || typeof durumu !== 'string') return dogrulama();
    if (!d.katilimcilar.includes(ogrenciId)) {
      return hata(422, 'ogrenci_katilimci_degil', 'Öğrenci bu dersin katılımcısı değil.');
    }
    const anah = `${d.id}/${ogrenciId}`;
    const mevcut = s.yoklamalar.get(anah);
    const isaret =
      typeof r.isaretlenme_at === 'string' ? r.isaretlenme_at : new Date().toISOString();
    if (mevcut && Date.parse(isaret) < Date.parse(mevcut.isaretlenme_at as string)) {
      sonuclar.push({
        ogrenci_id: ogrenciId,
        sonuc: 'eski',
        yoklama: mevcut,
        kalan_kredi: null,
        uyari: null,
      });
      continue;
    }
    const yeniNot = typeof r.not === 'string' && r.not.length > 0 ? r.not : null;
    const gorunurluk =
      yeniNot !== null && r.not_gorunurluk === 'ogrenciye' ? 'ogrenciye' : 'ogretmene_ozel';
    const gecDk = durumu === 'gec' && typeof r.gec_dakika === 'number' ? r.gec_dakika : null;
    const ayni =
      mevcut?.durum === durumu &&
      mevcut.gec_dakika === gecDk &&
      mevcut.not === yeniNot &&
      mevcut.not_gorunurluk === gorunurluk;
    if (ayni) {
      sonuclar.push({
        ogrenci_id: ogrenciId,
        sonuc: 'ayni',
        yoklama: mevcut,
        kalan_kredi: null,
        uyari: null,
      });
      continue;
    }
    const satir = {
      id: (mevcut?.id as string | undefined) ?? uid(),
      ders_id: d.id,
      ogrenci_id: ogrenciId,
      durum: durumu,
      gec_dakika: gecDk,
      not: yeniNot,
      not_gorunurluk: gorunurluk,
      isaretleyen_id: kimlikler(kurumId).ogretmenId,
      isaretlenme_at: isaret,
      sunucu_at: new Date().toISOString(),
      surum: ((mevcut?.surum as number | undefined) ?? 0) + 1,
    };
    s.yoklamalar.set(anah, satir);
    const etki = finansKrediUygula(
      kurumId,
      ogrenciId,
      (mevcut?.durum as string | undefined) ?? null,
      durumu,
      d.id,
    );
    sonuclar.push({
      ogrenci_id: ogrenciId,
      sonuc: mevcut ? 'guncellendi' : 'yeni',
      yoklama: satir,
      kalan_kredi: etki.kalanKredi,
      uyari: etki.uyari,
    });
  }
  d.durum = 'tamamlandi';
  const yanit: MockYanit = {
    durum: 200,
    govde: { ders_id: d.id, ders_durumu: d.durum, sonuclar },
  };
  s.idempotency.set(anahtar, { govde: ham, yanit });
  return yanit;
}

// --- Yonlendirme -----------------------------------------------------------------------------

function sayfala(liste: Ders[], sorgu: URLSearchParams) {
  const limit = Math.min(Math.max(Number(sorgu.get('limit') ?? 200) || 200, 1), 500);
  const imlec = sorgu.get('imlec');
  const basla = imlec ? liste.findIndex((o) => o.id === imlec) + 1 : 0;
  const dilim = liste.slice(basla, basla + limit);
  const sonraki = basla + limit < liste.length ? (dilim[dilim.length - 1]?.id ?? null) : null;
  return { dilim, sonraki };
}

export function dersMock(istek: MockIstek): MockYanit {
  const parcalar = istek.yol.split('/');
  const kurumId = parcalar[1];
  if (parcalar[0] !== 'kurumlar' || !kurumId || !(kurumId in MOCK_KURUM_ROLLERI))
    return bulunamadi();
  const rol = rolu(kurumId);
  const s = durum(kurumId);
  const { yontem, sorgu } = istek;
  const [kaynak, id, alt] = parcalar.slice(2);
  const g = govdeNesnesi(istek.govde);
  const yazabilir = rol !== 'ogrenci';

  if (kaynak === 'yoklama-bekleyen' && yontem === 'GET') {
    if (!yazabilir) return izinYok();
    const simdi = Date.now();
    const liste = gorunenDersler(kurumId, s)
      .filter(
        (d) =>
          d.durum === 'planli' &&
          Date.parse(d.baslangic_at) <= simdi &&
          simdi - Date.parse(d.baslangic_at) <= 14 * GUN_MS &&
          d.katilimcilar.some((o) => !s.yoklamalar.has(`${d.id}/${o}`)),
      )
      .sort((a, b) => Date.parse(b.baslangic_at) - Date.parse(a.baslangic_at));
    const { dilim, sonraki } = sayfala(liste, sorgu);
    return {
      durum: 200,
      govde: {
        dersler: dilim.map((d) => ({
          ...dersGorunumu(d),
          yoklamasi_eksik_sayisi: d.katilimcilar.filter((o) => !s.yoklamalar.has(`${d.id}/${o}`))
            .length,
        })),
        sonraki_imlec: sonraki,
      },
    };
  }

  if (kaynak === 'seriler' && yontem === 'POST' && !id) {
    return yazabilir ? seriOlustur(kurumId, s, g) : izinYok();
  }

  if (kaynak !== 'dersler') return bulunamadi();

  if (!id && yontem === 'GET') {
    const bas = Date.parse(sorgu.get('baslangic') ?? '');
    const bit = Date.parse(sorgu.get('bitis') ?? '');
    if (Number.isNaN(bas) || Number.isNaN(bit) || bit <= bas) return dogrulama();
    const ogretmen = sorgu.get('ogretmen_id');
    const grup = sorgu.get('grup_id');
    const dur = sorgu.get('durum');
    const liste = gorunenDersler(kurumId, s)
      .filter(
        (d) =>
          Date.parse(d.baslangic_at) < bit &&
          Date.parse(d.bitis_at) > bas &&
          (!ogretmen || d.ogretmen_id === ogretmen) &&
          (!grup || d.grup_id === grup) &&
          (!dur || d.durum === dur),
      )
      .sort((a, b) => Date.parse(a.baslangic_at) - Date.parse(b.baslangic_at));
    const { dilim, sonraki } = sayfala(liste, sorgu);
    return { durum: 200, govde: { dersler: dilim.map(dersGorunumu), sonraki_imlec: sonraki } };
  }
  if (!id && yontem === 'POST') return yazabilir ? dersOlustur(kurumId, s, g) : izinYok();

  const d = gorunenDersler(kurumId, s).find((x) => x.id === id);
  if (!d) return bulunamadi();

  if (!alt && yontem === 'GET') return { durum: 200, govde: dersDetayi(kurumId, d) };
  if (!yazabilir && alt !== 'yoklamalar') return izinYok();
  if (!alt && yontem === 'PATCH') return guncelle(kurumId, s, d, g);
  if (alt === 'tasi' && yontem === 'POST') return tasi(kurumId, s, d, g);
  if (alt === 'iptal' && yontem === 'POST') return iptalEt(kurumId, s, d, g);
  if (alt === 'yoklamalar' && yontem === 'GET') return yoklamaListesi(kurumId, s, d);
  if (alt === 'yoklamalar' && yontem === 'PUT') {
    return yazabilir ? yoklamaKaydet(kurumId, s, d, istek) : izinYok();
  }
  return bulunamadi();
}
