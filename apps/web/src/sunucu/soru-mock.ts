import {
  SORU_SES_EN_FAZLA_SN,
  SoruAyarlariGuncelleGirdiSema,
  SoruBildirimGirdiSema,
  SoruBildirimKapatGirdiSema,
  SoruCevapGirdiSema,
  SoruMasasiGuncelleGirdiSema,
  SoruMasasiOlusturGirdiSema,
  SoruMasasiUyeGirdiSema,
  SoruMusaitlikGirdiSema,
  SoruOlusturGirdiSema,
  SoruTakipGirdiSema,
} from '@kopru/contracts';

import { MOCK_KURUM_ROLLERI, mockKurumVerisi } from './hesap-mock';
import { medyaMockAdres, medyaMockHazirMi } from './medya-mock';
import type { MockIstek, MockYanit } from './vekil';

/**
 * `NEXT_PUBLIC_API_MOCK=1` iken "soru sor" uclarinin bellek ici karsiligi (`services/api` `soru-*.ts`).
 * Yanit sekilleri `@kopru/contracts` ile aynidir. Bilerek kurumlar arasi ORTAK bir depo: mock kurumlarinin
 * uyelik kimlikleri rastgele uretildigi icin ogrenci (`kurum-atlas`) ile ogretmen (`kurum-ege`) ayni sorulari
 * gorsun diye kisiler sabit kimliklidir; "ben" kurumun rolunden gelir. Kota gunluk (UTC+3 gunu). Yalniz
 * deneme ve e2e icindir; veri sunucu sureci yeniden baslayana kadar bellekte kalir.
 */

type Rol = 'ogretmen' | 'yonetici' | 'ogrenci' | 'sahip';
type Durum = 'acik' | 'cevaplandi' | 'takip_bekliyor' | 'cozuldu' | 'kapandi';

interface Ek {
  id: string;
  tur: 'fotograf' | 'cizimli_fotograf' | 'ses';
  medya_dosya_id: string;
  kaynak_dosya_id: string | null;
  sure_sn: number | null;
  cizim_verisi: unknown;
  sira: number;
}
interface Mesaj {
  id: string;
  yazar_id: string;
  yazar_adi: string;
  yazar_rolu: 'ogrenci' | 'ogretmen' | 'yonetici';
  tur: 'soru' | 'cevap' | 'takip';
  metin: string | null;
  derste_konusalim: boolean;
  sira: number;
  created_at: string;
  ekler: Ek[];
  istekId: string | null;
}
interface MSoru {
  id: string;
  ogrenci_id: string;
  brans_kodu: string;
  konu_id: string | null;
  baslik: string | null;
  durum: Durum;
  atanan_ogretmen_id: string | null;
  masa_id: string | null;
  ustlenen_id: string | null;
  created_at: string;
  son_hareket_at: string;
  ilk_cevap_at: string | null;
  cozuldu_at: string | null;
  cozulduKaynagi: 'ogrenci' | 'otomatik' | null;
  ilkCevapYazari: string | null;
  yeniden_acilma_sayisi: number;
  fotograflar: { medya_dosya_id: string; sira: number }[];
  mesajlar: Mesaj[];
  istekId: string | null;
}
interface Masa {
  id: string;
  brans_kodu: string;
  ad: string;
  aktif: boolean;
  arsivlendi_at: string | null;
  uyeler: { ogretmen_id: string; gorunen_ad: string | null }[];
  surum: number;
  created_at: string;
}
interface Bildirim {
  id: string;
  soru_id: string;
  mesaj_id: string | null;
  brans_kodu: string;
  bildiren_id: string;
  bildiren_adi: string | null;
  neden: string;
  aciklama: string | null;
  durum: 'acik' | 'kapandi';
  created_at: string;
  kapandi_at: string | null;
  kapatma_notu: string | null;
}
interface Ayar {
  gunluk_soru_limiti: number | null;
  aylik_soru_limiti: number | null;
  soru_basina_takip_limiti: number;
  ses_azami_sn: number;
  foto_saklama_gun: number;
  varsayilan: boolean;
  surum: number | null;
}
interface Depo {
  sorular: MSoru[];
  masalar: Masa[];
  bildirimler: Bildirim[];
  ayar: Ayar;
  musait: boolean;
  musaitDegilTarihi: string | null;
}

// --- Kisiler (sabit) ----------------------------------------------------------------------------

const OGRENCI = { id: '0190a000-0000-7000-8000-000000000001', ad: 'Çağlar Yıldız' };
const OGRENCI2 = { id: '0190a000-0000-7000-8000-000000000002', ad: 'Elif Şahin' };
const OGRETMEN = { id: '0190a000-0000-7000-8000-000000000011', ad: 'Burcu Tekin' };
const OGRETMEN2 = { id: '0190a000-0000-7000-8000-000000000012', ad: 'Hasan Polat' };
const YONETICI = { id: '0190a000-0000-7000-8000-000000000021', ad: 'Mert Aydın' };
const KISILER = [OGRENCI, OGRENCI2, OGRETMEN, OGRETMEN2, YONETICI];
const adi = (id: string | null): string | null => KISILER.find((k) => k.id === id)?.ad ?? null;

const rolu = (kurumId: string): Rol => MOCK_KURUM_ROLLERI[kurumId] ?? 'ogretmen';
const benId = (kurumId: string): string => {
  const r = rolu(kurumId);
  return r === 'ogrenci' ? OGRENCI.id : r === 'ogretmen' ? OGRETMEN.id : YONETICI.id;
};
const personel = (kurumId: string) => rolu(kurumId) !== 'ogrenci';
const yonetim = (kurumId: string) => rolu(kurumId) === 'yonetici' || rolu(kurumId) === 'sahip';

const hata = (durum: number, kod: string, mesaj: string, details?: unknown): MockYanit => ({
  durum,
  govde: { error: { code: kod, message: mesaj, ...(details === undefined ? {} : { details }) } },
});
const izinYok = () => hata(403, 'izin_yok', 'Bu işlem için yetkin yok.');
const bulunamadi = () => hata(404, 'bulunamadi', 'Kaynak bulunamadı.');
const dogrulama = () => hata(400, 'dogrulama_hatasi', 'İstek doğrulanamadı.');
/** Yanit ani goruntu olarak doner (bellekteki kayit sonradan degisse de yanit degismez). */
const ok = (govde: unknown, durum = 200): MockYanit => ({ durum, govde: structuredClone(govde) });
const uid = () => crypto.randomUUID();

const SAAT_MS = 3_600_000;
const GUN_MS = 86_400_000;
const UTC3 = 3 * SAAT_MS;
const once = (saat: number) => new Date(Date.now() - saat * SAAT_MS).toISOString();
const yerelGun = (iso: string | number) =>
  new Date((typeof iso === 'number' ? iso : Date.parse(iso)) + UTC3).toISOString().slice(0, 10);
const yerelAy = (iso: string) => yerelGun(iso).slice(0, 7);
const gunSonu = (): string => {
  const g = yerelGun(Date.now());
  return new Date(Date.parse(`${g}T00:00:00Z`) + GUN_MS - UTC3).toISOString();
};
const aySonu = (): string => {
  const d = new Date(Date.now() + UTC3);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - UTC3).toISOString();
};

function normalle(s: string): string {
  return s
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// --- Depo ---------------------------------------------------------------------------------------

const kutu = globalThis as unknown as { __kopruSoruMock?: Depo };

export function soruMockSifirla(): void {
  kutu.__kopruSoruMock = undefined;
}

function mesaj(
  yazar: { id: string; ad: string },
  rol: Mesaj['yazar_rolu'],
  tur: Mesaj['tur'],
  metin: string | null,
  at: string,
  sira: number,
  ekler: Ek[] = [],
): Mesaj {
  return {
    id: uid(),
    yazar_id: yazar.id,
    yazar_adi: yazar.ad,
    yazar_rolu: rol,
    tur,
    metin,
    derste_konusalim: false,
    sira,
    created_at: at,
    ekler,
    istekId: null,
  };
}

function tohumSoru(
  o: Partial<MSoru> &
    Pick<MSoru, 'ogrenci_id' | 'brans_kodu' | 'baslik' | 'durum' | 'created_at' | 'mesajlar'>,
): MSoru {
  return {
    id: uid(),
    konu_id: null,
    atanan_ogretmen_id: o.brans_kodu === 'fizik' ? OGRETMEN2.id : OGRETMEN.id,
    masa_id: null,
    ustlenen_id: null,
    son_hareket_at: o.created_at,
    ilk_cevap_at: null,
    cozuldu_at: null,
    cozulduKaynagi: null,
    ilkCevapYazari: null,
    yeniden_acilma_sayisi: 0,
    fotograflar: [],
    istekId: null,
    ...o,
  };
}

function tohum(): Depo {
  const s2 = OGRENCI2;
  const s1 = OGRENCI;
  const acik = tohumSoru({
    ogrenci_id: s2.id,
    brans_kodu: 'matematik',
    baslik: 'Denklemde ters işlem',
    durum: 'acik',
    created_at: once(3),
    fotograflar: [{ medya_dosya_id: 'ornek-a1', sira: 0 }],
    mesajlar: [
      mesaj(s2, 'ogrenci', 'soru', 'Üçüncü adımda neden 17 - 5 yapıyoruz, anlamadım.', once(3), 0),
    ],
  });
  const cevapli = tohumSoru({
    ogrenci_id: s2.id,
    brans_kodu: 'matematik',
    baslik: 'Üslü sayılar',
    durum: 'cevaplandi',
    created_at: once(30),
    son_hareket_at: once(28),
    ilk_cevap_at: once(28),
    ilkCevapYazari: OGRETMEN.id,
    ustlenen_id: OGRETMEN.id,
    fotograflar: [{ medya_dosya_id: 'ornek-a2', sira: 0 }],
    mesajlar: [
      mesaj(s2, 'ogrenci', 'soru', '2 üzeri 3 çarpı 2 üzeri 4 kaç eder?', once(30), 0),
      mesaj(
        OGRETMEN,
        'ogretmen',
        'cevap',
        'Tabanlar aynı olduğu için üsler toplanır: 2^(3+4) = 2^7 = 128.',
        once(28),
        1,
      ),
    ],
  });
  const benimCevapli = tohumSoru({
    ogrenci_id: s1.id,
    brans_kodu: 'matematik',
    baslik: 'Çarpanlara ayırma',
    durum: 'cevaplandi',
    created_at: once(50),
    son_hareket_at: once(48),
    ilk_cevap_at: once(48),
    ilkCevapYazari: OGRETMEN.id,
    ustlenen_id: OGRETMEN.id,
    fotograflar: [{ medya_dosya_id: 'ornek-b1', sira: 0 }],
    mesajlar: [
      mesaj(
        s1,
        'ogrenci',
        'soru',
        'x kare eksi 9 ifadesini nasıl çarpanlarına ayırırım?',
        once(50),
        0,
      ),
      mesaj(
        OGRETMEN,
        'ogretmen',
        'cevap',
        'İki kare farkı: x² − 9 = (x − 3)(x + 3). Derste ayrıca örnek yapalım.',
        once(48),
        1,
      ),
    ],
  });
  const benimCozulmus = tohumSoru({
    ogrenci_id: s1.id,
    brans_kodu: 'fizik',
    baslik: 'Hız ve ivme',
    durum: 'cozuldu',
    created_at: once(100),
    son_hareket_at: once(96),
    ilk_cevap_at: once(98),
    cozuldu_at: once(96),
    cozulduKaynagi: 'ogrenci',
    ilkCevapYazari: OGRETMEN2.id,
    ustlenen_id: OGRETMEN2.id,
    fotograflar: [{ medya_dosya_id: 'ornek-c1', sira: 0 }],
    mesajlar: [
      mesaj(s1, 'ogrenci', 'soru', 'Düzgün hızlanan harekette yol formülü nedir?', once(100), 0),
      mesaj(
        OGRETMEN2,
        'ogretmen',
        'cevap',
        'x = v₀t + ½at². Yukarıdaki şekilde işaretledim.',
        once(98),
        1,
      ),
    ],
  });
  const fizik = tohumSoru({
    ogrenci_id: s2.id,
    brans_kodu: 'fizik',
    baslik: 'Newton yasaları',
    durum: 'acik',
    created_at: once(5),
    fotograflar: [{ medya_dosya_id: 'ornek-d1', sira: 0 }],
    mesajlar: [mesaj(s2, 'ogrenci', 'soru', 'Net kuvvet sıfırsa cisim durur mu?', once(5), 0)],
  });
  return {
    sorular: [acik, cevapli, benimCevapli, benimCozulmus, fizik],
    masalar: [],
    bildirimler: [],
    ayar: {
      gunluk_soru_limiti: 3,
      aylik_soru_limiti: null,
      soru_basina_takip_limiti: 3,
      ses_azami_sn: SORU_SES_EN_FAZLA_SN,
      foto_saklama_gun: 30,
      varsayilan: true,
      surum: null,
    },
    musait: true,
    musaitDegilTarihi: null,
  };
}

const depo = (): Depo => (kutu.__kopruSoruMock ??= tohum());

// --- Bicimlendirme ------------------------------------------------------------------------------

function ek(e: Ek, kaynak: string) {
  return { ...e, adres: medyaMockAdres(kaynak, e.medya_dosya_id, e.sure_sn) };
}

function ozet(s: MSoru) {
  const ilk = s.mesajlar[0];
  const onizleme = ilk?.metin ? ilk.metin.slice(0, 120) : null;
  return {
    id: s.id,
    ogrenci_id: s.ogrenci_id,
    ogrenci_adi: adi(s.ogrenci_id),
    brans_kodu: s.brans_kodu,
    konu_id: s.konu_id,
    baslik: s.baslik,
    metin_onizleme: onizleme,
    durum: s.durum,
    yonlendirme: s.masa_id ? 'masa' : s.atanan_ogretmen_id ? 'atanan_ogretmen' : 'yonetici',
    atanan_ogretmen_id: s.atanan_ogretmen_id,
    masa_id: s.masa_id,
    ustlenen_id: s.ustlenen_id,
    mesaj_sayisi: s.mesajlar.length,
    created_at: s.created_at,
    son_hareket_at: s.son_hareket_at,
    ilk_cevap_at: s.ilk_cevap_at,
    cozuldu_at: s.cozuldu_at,
  };
}

const takipSayisi = (s: MSoru) => s.mesajlar.filter((m) => m.tur === 'takip').length;

function detay(s: MSoru, kaynak: string) {
  return {
    ...ozet(s),
    foto_silinme_at: s.cozuldu_at
      ? new Date(Date.parse(s.cozuldu_at) + depo().ayar.foto_saklama_gun * GUN_MS).toISOString()
      : null,
    yeniden_acilma_sayisi: s.yeniden_acilma_sayisi,
    kalan_takip_hakki: Math.max(0, depo().ayar.soru_basina_takip_limiti - takipSayisi(s)),
    fotograflar: s.fotograflar.map((f) => ({
      ...f,
      adres: medyaMockAdres(kaynak, f.medya_dosya_id),
    })),
    mesajlar: s.mesajlar.map((m) => ({
      id: m.id,
      yazar_id: m.yazar_id,
      yazar_adi: m.yazar_adi,
      yazar_rolu: m.yazar_rolu,
      tur: m.tur,
      metin: m.metin,
      derste_konusalim: m.derste_konusalim,
      sira: m.sira,
      created_at: m.created_at,
      ekler: m.ekler.map((e) => ek(e, kaynak)),
    })),
    adres_alinamadi: false,
  };
}

function kota(ogrenciId: string) {
  const d = depo();
  const benim = d.sorular.filter((s) => s.ogrenci_id === ogrenciId);
  const bugun = yerelGun(Date.now());
  const ay = bugun.slice(0, 7);
  const gunluk = benim.filter((s) => yerelGun(s.created_at) === bugun).length;
  const aylik = benim.filter((s) => yerelAy(s.created_at) === ay).length;
  const gl = d.ayar.gunluk_soru_limiti;
  const al = d.ayar.aylik_soru_limiti;
  return {
    gunluk_limit: gl,
    gunluk_kullanilan: gunluk,
    gunluk_kalan: gl === null ? null : Math.max(0, gl - gunluk),
    gunluk_sifirlanma_at: gunSonu(),
    aylik_limit: al,
    aylik_kullanilan: aylik,
    aylik_kalan: al === null ? null : Math.max(0, al - aylik),
    aylik_sifirlanma_at: aySonu(),
  };
}

function sayfala(liste: MSoru[], sorgu: URLSearchParams) {
  const limit = Math.min(Math.max(Number(sorgu.get('limit') ?? 20) || 20, 1), 100);
  const imlec = sorgu.get('imlec');
  const basla = imlec ? liste.findIndex((s) => s.id === imlec) + 1 : 0;
  const dilim = liste.slice(basla, basla + limit);
  const sonraki = basla + limit < liste.length ? (dilim[dilim.length - 1]?.id ?? null) : null;
  return { sorular: dilim.map(ozet), sonraki_imlec: sonraki };
}

function suz(
  liste: MSoru[],
  sorgu: URLSearchParams,
  alanlar: { durum?: boolean; konu?: boolean; ogrenci?: boolean; q?: boolean; ogretmen?: boolean },
): MSoru[] {
  const brans = sorgu.get('brans_kodu');
  const durum = sorgu.get('durum');
  const konu = sorgu.get('konu_id');
  const ogr = sorgu.get('ogrenci_id');
  const q = sorgu.get('q');
  const ogretmen = sorgu.get('ogretmen_id');
  const n = q ? normalle(q) : null;
  return liste.filter(
    (s) =>
      (!brans || s.brans_kodu === brans) &&
      (!alanlar.durum || !durum || s.durum === durum) &&
      (!alanlar.konu || !konu || s.konu_id === konu) &&
      (!alanlar.ogrenci || !ogr || s.ogrenci_id === ogr) &&
      (!alanlar.ogretmen ||
        !ogretmen ||
        s.atanan_ogretmen_id === ogretmen ||
        s.ustlenen_id === ogretmen ||
        s.ilkCevapYazari === ogretmen) &&
      (!alanlar.q ||
        !n ||
        normalle(`${s.baslik ?? ''} ${s.mesajlar.map((m) => m.metin ?? '').join(' ')}`).includes(
          n,
        )),
  );
}

const sonHareketeGore = (a: MSoru, b: MSoru) =>
  Date.parse(b.son_hareket_at) - Date.parse(a.son_hareket_at);

function kuyrugaGirer(s: MSoru, kurumId: string): boolean {
  if (yonetim(kurumId)) return true;
  const ben = benId(kurumId);
  if (s.atanan_ogretmen_id === ben) return true;
  const masa = depo().masalar.find((m) => m.id === s.masa_id);
  return masa?.uyeler.some((u) => u.ogretmen_id === ben) ?? false;
}

function eklerGirdisi(
  ekler: readonly (
    | { tur: 'fotograf'; medya_dosya_id: string }
    | {
        tur: 'cizimli_fotograf';
        medya_dosya_id: string;
        kaynak_dosya_id: string;
        cizim_verisi?: unknown;
      }
    | { tur: 'ses'; medya_dosya_id: string; sure_sn?: number | undefined }
  )[],
): { ek: Ek[]; eksik: string[] } {
  const eksik: string[] = [];
  const liste = ekler.map((e, i): Ek => {
    if (!medyaMockHazirMi(e.medya_dosya_id)) eksik.push(e.medya_dosya_id);
    return {
      id: uid(),
      tur: e.tur,
      medya_dosya_id: e.medya_dosya_id,
      kaynak_dosya_id: e.tur === 'cizimli_fotograf' ? e.kaynak_dosya_id : null,
      sure_sn: e.tur === 'ses' ? (e.sure_sn ?? null) : null,
      cizim_verisi: e.tur === 'cizimli_fotograf' ? (e.cizim_verisi ?? null) : null,
      sira: i,
    };
  });
  return { ek: liste, eksik };
}

// --- Uclar --------------------------------------------------------------------------------------

export function soruMock(istek: MockIstek): MockYanit | null {
  const p = istek.yol.split('/');
  if (p[0] !== 'kurumlar' || !p[1] || !(p[1] in MOCK_KURUM_ROLLERI)) return null;
  const kurumId = p[1];
  const kalan = p.slice(2);
  const ilk = kalan[0] ?? '';
  const kaynak = istek.kaynak ?? 'http://localhost:3000';
  const m = istek.yontem;
  const d = depo();
  const govde = istek.govde;
  const ben = benId(kurumId);

  // --- Ogrenci
  if (ilk === 'sorular' && kalan.length === 1 && m === 'POST') {
    if (rolu(kurumId) !== 'ogrenci') return izinYok();
    const g = SoruOlusturGirdiSema.safeParse(govde);
    if (!g.success) return dogrulama();
    const onceki = g.data.istek_id
      ? d.sorular.find((s) => s.istekId === g.data.istek_id && s.ogrenci_id === ben)
      : undefined;
    if (onceki)
      return ok({
        ...detay(onceki, kaynak),
        tekrar: true,
        kota: kota(ben),
        tahmini_cevap: tahmin(onceki),
      });
    const k = kota(ben);
    if (k.gunluk_kalan === 0 || k.aylik_kalan === 0) {
      return hata(
        429,
        'kota_asildi',
        k.gunluk_kalan === 0 ? 'Bugünkü soru hakkınız doldu.' : 'Bu ayki soru hakkınız doldu.',
        { kota: k, kota_turu: k.gunluk_kalan === 0 ? 'gunluk' : 'aylik' },
      );
    }
    const eksik = g.data.fotograflar.filter((id) => !medyaMockHazirMi(id));
    if (eksik.length > 0) {
      return hata(409, 'dosya_hazir_degil', 'Dosya henüz hazır değil.', { dosya_idleri: eksik });
    }
    const simdi = new Date().toISOString();
    const hedef = g.data.brans_kodu === 'fizik' ? OGRETMEN2.id : OGRETMEN.id;
    const masa = d.masalar.find(
      (x) => x.aktif && x.arsivlendi_at === null && x.brans_kodu === g.data.brans_kodu,
    );
    const isaretler = (g.data.isaretler ?? []).map(
      (
        i,
      ): {
        tur: 'cizimli_fotograf';
        medya_dosya_id: string;
        kaynak_dosya_id: string;
        cizim_verisi?: unknown;
      } => ({
        tur: 'cizimli_fotograf',
        medya_dosya_id: i.medya_dosya_id,
        kaynak_dosya_id: i.kaynak_dosya_id,
        ...(i.cizim_verisi === undefined ? {} : { cizim_verisi: i.cizim_verisi }),
      }),
    );
    const s: MSoru = {
      id: uid(),
      ogrenci_id: ben,
      brans_kodu: g.data.brans_kodu,
      konu_id: g.data.konu_id ?? null,
      baslik: g.data.baslik ?? null,
      durum: 'acik',
      atanan_ogretmen_id: masa ? null : hedef,
      masa_id: masa?.id ?? null,
      ustlenen_id: null,
      created_at: simdi,
      son_hareket_at: simdi,
      ilk_cevap_at: null,
      cozuldu_at: null,
      cozulduKaynagi: null,
      ilkCevapYazari: null,
      yeniden_acilma_sayisi: 0,
      fotograflar: g.data.fotograflar.map((id, sira) => ({ medya_dosya_id: id, sira })),
      mesajlar: [
        {
          ...mesaj(
            OGRENCI,
            'ogrenci',
            'soru',
            g.data.metin ?? null,
            simdi,
            0,
            eklerGirdisi(isaretler).ek,
          ),
        },
      ],
      istekId: g.data.istek_id ?? null,
    };
    d.sorular.push(s);
    return ok(
      { ...detay(s, kaynak), tekrar: false, kota: kota(ben), tahmini_cevap: tahmin(s) },
      201,
    );
  }

  if (ilk === 'sorularim' && m === 'GET') {
    if (rolu(kurumId) !== 'ogrenci') return izinYok();
    const liste = suz(
      d.sorular.filter((s) => s.ogrenci_id === ben),
      istek.sorgu,
      { durum: true, konu: true, q: true },
    ).sort(sonHareketeGore);
    return ok(sayfala(liste, istek.sorgu));
  }
  if (ilk === 'soru-kotam' && m === 'GET') {
    return rolu(kurumId) === 'ogrenci' ? ok(kota(ben)) : izinYok();
  }

  if (ilk === 'sorular' && kalan[1] && !kalan[2] && m === 'GET') {
    const s = d.sorular.find((x) => x.id === kalan[1]);
    if (!s || (rolu(kurumId) === 'ogrenci' && s.ogrenci_id !== ben)) return bulunamadi();
    return ok(detay(s, kaynak));
  }

  if (ilk === 'sorular' && kalan[1] && kalan[2] && m === 'POST') {
    const s = d.sorular.find((x) => x.id === kalan[1]);
    if (!s) return bulunamadi();
    const eylem = kalan[2];
    if (eylem === 'anladim') {
      if (rolu(kurumId) !== 'ogrenci') return izinYok();
      if (s.ogrenci_id !== ben) return bulunamadi();
      if (s.durum !== 'cozuldu') {
        if (s.durum !== 'cevaplandi' && s.durum !== 'takip_bekliyor') {
          return hata(409, 'soru_durumu_gecersiz', 'Soru henüz cevaplanmadı.');
        }
        s.durum = 'cozuldu';
        s.cozuldu_at = new Date().toISOString();
        s.cozulduKaynagi = 'ogrenci';
        s.son_hareket_at = s.cozuldu_at;
      }
      return ok(detay(s, kaynak));
    }
    if (eylem === 'takip') {
      if (rolu(kurumId) !== 'ogrenci') return izinYok();
      if (s.ogrenci_id !== ben) return bulunamadi();
      const g = SoruTakipGirdiSema.safeParse(govde);
      if (!g.success) return dogrulama();
      if (g.data.istek_id && s.mesajlar.some((x) => x.istekId === g.data.istek_id)) {
        return ok(detay(s, kaynak));
      }
      if (s.durum !== 'cevaplandi' && s.durum !== 'cozuldu') {
        return hata(
          409,
          'soru_durumu_gecersiz',
          'Takip sorusu yalnızca cevaplanmış ya da çözülmüş soruya sorulur.',
        );
      }
      if (takipSayisi(s) >= d.ayar.soru_basina_takip_limiti) {
        return hata(422, 'takip_limiti_asildi', 'Bu soru için takip sorusu hakkınız doldu.');
      }
      const e = eklerGirdisi(g.data.ekler ?? []);
      if (e.eksik.length > 0) {
        return hata(409, 'dosya_hazir_degil', 'Dosya henüz hazır değil.', {
          dosya_idleri: e.eksik,
        });
      }
      const simdi = new Date().toISOString();
      const yeni = mesaj(OGRENCI, 'ogrenci', 'takip', g.data.metin, simdi, s.mesajlar.length, e.ek);
      yeni.istekId = g.data.istek_id ?? null;
      s.mesajlar.push(yeni);
      if (s.durum === 'cozuldu') s.yeniden_acilma_sayisi += 1;
      s.durum = 'takip_bekliyor';
      s.cozuldu_at = null;
      s.cozulduKaynagi = null;
      s.son_hareket_at = simdi;
      return ok(detay(s, kaynak));
    }
    if (eylem === 'bildir') {
      const g = SoruBildirimGirdiSema.safeParse(govde);
      if (!g.success) return dogrulama();
      const var_ = d.bildirimler.find(
        (b) => b.soru_id === s.id && b.bildiren_id === ben && b.durum === 'acik',
      );
      if (var_) return ok(var_);
      const b: Bildirim = {
        id: uid(),
        soru_id: s.id,
        mesaj_id: g.data.mesaj_id ?? null,
        brans_kodu: s.brans_kodu,
        bildiren_id: ben,
        bildiren_adi: adi(ben),
        neden: g.data.neden,
        aciklama: g.data.aciklama ?? null,
        durum: 'acik',
        created_at: new Date().toISOString(),
        kapandi_at: null,
        kapatma_notu: null,
      };
      d.bildirimler.push(b);
      return ok(b);
    }
    if (eylem === 'cevap') {
      if (!personel(kurumId)) return izinYok();
      const g = SoruCevapGirdiSema.safeParse(govde);
      if (!g.success) return dogrulama();
      const e = eklerGirdisi(g.data.ekler ?? []);
      if (!g.data.metin && !g.data.derste_konusalim && e.ek.length === 0) {
        return hata(422, 'cevap_bos', 'Cevap boş olamaz.');
      }
      const uzun = e.ek.find((x) => x.tur === 'ses' && (x.sure_sn ?? 0) > d.ayar.ses_azami_sn);
      if (uzun)
        return hata(
          422,
          'ses_cok_uzun',
          `Ses cevabı en çok ${String(d.ayar.ses_azami_sn)} saniye olabilir.`,
        );
      if (e.eksik.length > 0) {
        return hata(409, 'dosya_hazir_degil', 'Dosya henüz hazır değil.', {
          dosya_idleri: e.eksik,
        });
      }
      if (s.durum !== 'acik' && s.durum !== 'takip_bekliyor') {
        return hata(409, 'soru_durumu_gecersiz', 'Soru cevap beklemiyor.');
      }
      if (g.data.istek_id && s.mesajlar.some((x) => x.istekId === g.data.istek_id)) {
        return ok(detay(s, kaynak));
      }
      const simdi = new Date().toISOString();
      const yazar = rolu(kurumId) === 'ogretmen' ? OGRETMEN : YONETICI;
      const yeni = mesaj(
        yazar,
        rolu(kurumId) === 'ogretmen' ? 'ogretmen' : 'yonetici',
        'cevap',
        g.data.metin ?? null,
        simdi,
        s.mesajlar.length,
        e.ek,
      );
      yeni.derste_konusalim = g.data.derste_konusalim;
      yeni.istekId = g.data.istek_id ?? null;
      s.mesajlar.push(yeni);
      s.durum = 'cevaplandi';
      s.ustlenen_id ??= ben;
      s.ilk_cevap_at ??= simdi;
      s.ilkCevapYazari ??= ben;
      s.son_hareket_at = simdi;
      return ok(detay(s, kaynak));
    }
    return bulunamadi();
  }

  // --- Ogretmen
  if (ilk === 'gelen-sorular' && m === 'GET') {
    if (!personel(kurumId)) return izinYok();
    if (kalan[1] === 'sayi') {
      const bekleyen = d.sorular.filter(
        (s) => (s.durum === 'acik' || s.durum === 'takip_bekliyor') && kuyrugaGirer(s, kurumId),
      );
      const bransler = new Map<string, number>();
      for (const s of bekleyen) bransler.set(s.brans_kodu, (bransler.get(s.brans_kodu) ?? 0) + 1);
      const enEski = bekleyen.map((s) => Date.parse(s.son_hareket_at)).sort((a, b) => a - b)[0];
      return ok({
        bekleyen: bekleyen.length,
        branslar: [...bransler].map(([brans_kodu, n]) => ({ brans_kodu, bekleyen: n })),
        en_eski_at: enEski === undefined ? null : new Date(enEski).toISOString(),
      });
    }
    const durum = istek.sorgu.get('durum');
    const liste = suz(
      d.sorular.filter(
        (s) =>
          kuyrugaGirer(s, kurumId) &&
          (durum ? s.durum === durum : s.durum === 'acik' || s.durum === 'takip_bekliyor'),
      ),
      istek.sorgu,
      { ogrenci: true },
    ).sort((a, b) => Date.parse(a.son_hareket_at) - Date.parse(b.son_hareket_at));
    return ok(sayfala(liste, istek.sorgu));
  }
  if (ilk === 'cevapladigim-sorular' && m === 'GET') {
    if (!personel(kurumId)) return izinYok();
    const liste = suz(
      d.sorular.filter((s) => s.mesajlar.some((x) => x.tur === 'cevap' && x.yazar_id === ben)),
      istek.sorgu,
      { ogrenci: true, q: true },
    ).sort(sonHareketeGore);
    return ok(sayfala(liste, istek.sorgu));
  }
  if (ilk === 'soru-musaitligim') {
    if (!personel(kurumId)) return izinYok();
    if (m === 'GET') {
      return ok({ musait: d.musait, musait_degil_tarihi: d.musait ? null : d.musaitDegilTarihi });
    }
    if (m === 'PUT') {
      const g = SoruMusaitlikGirdiSema.safeParse(govde);
      if (!g.success) return dogrulama();
      d.musait = g.data.musait;
      d.musaitDegilTarihi = g.data.musait ? null : yerelGun(Date.now());
      return ok({ musait: d.musait, musait_degil_tarihi: d.musaitDegilTarihi });
    }
  }

  // --- Yonetim
  if (
    !yonetim(kurumId) &&
    ['soru-masalari', 'soru-ayarlari', 'yonetim', 'soru-bildirimleri', 'soru-olcum'].includes(ilk)
  ) {
    return izinYok();
  }
  if (ilk === 'soru-masalari') return masaIsle(kalan, istek);
  if (ilk === 'soru-ayarlari') {
    if (m === 'GET') return ok(d.ayar);
    if (m === 'PUT') {
      const g = SoruAyarlariGuncelleGirdiSema.safeParse(govde);
      if (!g.success) return dogrulama();
      d.ayar = {
        ...d.ayar,
        ...g.data,
        varsayilan: false,
        surum: (d.ayar.surum ?? 0) + 1,
      };
      return ok(d.ayar);
    }
  }
  if (ilk === 'yonetim' && kalan[1] === 'sorular' && m === 'GET') {
    const liste = suz(d.sorular, istek.sorgu, {
      durum: true,
      ogrenci: true,
      q: true,
      ogretmen: true,
    }).sort(sonHareketeGore);
    return ok(sayfala(liste, istek.sorgu));
  }
  if (ilk === 'soru-bildirimleri') {
    if (m === 'GET' && !kalan[1]) {
      const durum = istek.sorgu.get('durum') ?? 'acik';
      const liste = d.bildirimler.filter((b) => b.durum === durum).reverse();
      return ok({ bildirimler: liste, sonraki_imlec: null });
    }
    if (m === 'POST' && kalan[1] && kalan[2] === 'kapat') {
      const b = d.bildirimler.find((x) => x.id === kalan[1]);
      if (!b) return bulunamadi();
      const g = SoruBildirimKapatGirdiSema.safeParse(govde ?? {});
      if (!g.success) return dogrulama();
      b.durum = 'kapandi';
      b.kapandi_at = new Date().toISOString();
      b.kapatma_notu = g.data.not ?? null;
      return ok(b);
    }
  }
  if (ilk === 'soru-olcum' && m === 'GET') return ok(olcum(istek.sorgu));
  return null;
}

function tahmin(s: MSoru) {
  return {
    sure_sn: 1500,
    ornek_sayisi: 8,
    hedef_musait: s.masa_id ? true : depo().musait || s.brans_kodu === 'fizik',
  };
}

function masaIsle(kalan: string[], istek: MockIstek): MockYanit {
  const d = depo();
  const m = istek.yontem;
  const kurumId = istek.yol.split('/')[1] ?? '';
  const adBul = (id: string) =>
    mockKurumVerisi(kurumId).uyeler.find((u) => u.uyelik_id === id)?.gorunen_ad ?? adi(id);
  if (!kalan[1]) {
    if (m === 'GET') return ok({ masalar: d.masalar.filter((x) => x.arsivlendi_at === null) });
    if (m === 'POST') {
      const g = SoruMasasiOlusturGirdiSema.safeParse(istek.govde);
      if (!g.success) return dogrulama();
      if (
        d.masalar.some(
          (x) =>
            x.arsivlendi_at === null && x.brans_kodu === g.data.brans_kodu && x.ad === g.data.ad,
        )
      ) {
        return hata(409, 'masa_var', 'Bu branşta aynı adlı masa var.');
      }
      const masa: Masa = {
        id: uid(),
        brans_kodu: g.data.brans_kodu,
        ad: g.data.ad,
        aktif: g.data.aktif,
        arsivlendi_at: null,
        uyeler: (g.data.ogretmen_idleri ?? []).map((id) => ({
          ogretmen_id: id,
          gorunen_ad: adBul(id) ?? null,
        })),
        surum: 1,
        created_at: new Date().toISOString(),
      };
      d.masalar.push(masa);
      return ok(masa, 201);
    }
    return bulunamadi();
  }
  const masa = d.masalar.find((x) => x.id === kalan[1] && x.arsivlendi_at === null);
  if (!masa) return bulunamadi();
  if (!kalan[2]) {
    if (m === 'PATCH') {
      const g = SoruMasasiGuncelleGirdiSema.safeParse(istek.govde);
      if (!g.success) return dogrulama();
      if (g.data.surum !== masa.surum)
        return hata(409, 'surum_cakismasi', 'Masa başka biri tarafından değiştirildi.');
      if (g.data.ad !== undefined) masa.ad = g.data.ad;
      if (g.data.aktif !== undefined) masa.aktif = g.data.aktif;
      masa.surum += 1;
      return ok(masa);
    }
    if (m === 'DELETE') {
      masa.arsivlendi_at = new Date().toISOString();
      return { durum: 204 };
    }
  }
  if (kalan[2] === 'uyeler') {
    if (m === 'POST' && !kalan[3]) {
      const g = SoruMasasiUyeGirdiSema.safeParse(istek.govde);
      if (!g.success) return dogrulama();
      if (!masa.uyeler.some((u) => u.ogretmen_id === g.data.ogretmen_id)) {
        masa.uyeler.push({
          ogretmen_id: g.data.ogretmen_id,
          gorunen_ad: adBul(g.data.ogretmen_id) ?? null,
        });
      }
      masa.surum += 1;
      return ok(masa);
    }
    if (m === 'DELETE' && kalan[3]) {
      masa.uyeler = masa.uyeler.filter((u) => u.ogretmen_id !== kalan[3]);
      masa.surum += 1;
      return { durum: 204 };
    }
  }
  return bulunamadi();
}

function olcum(sorgu: URLSearchParams) {
  const d = depo();
  const bit = sorgu.get('bitis') ?? yerelGun(Date.now());
  const bas = sorgu.get('baslangic') ?? yerelGun(Date.now() - 30 * GUN_MS);
  const kume = d.sorular.filter((s) => {
    const g = yerelGun(s.created_at);
    return g >= bas && g <= bit;
  });
  const satir = (liste: MSoru[]) => {
    const cevaplanan = liste.filter((s) => s.ilk_cevap_at !== null);
    const anladim = liste.filter((s) => s.cozulduKaynagi === 'ogrenci').length;
    const sureler = cevaplanan.map(
      (s) => (Date.parse(s.ilk_cevap_at ?? s.created_at) - Date.parse(s.created_at)) / 1000,
    );
    return {
      soru_sayisi: liste.length,
      cevaplanan: cevaplanan.length,
      anladim,
      anladim_orani: cevaplanan.length === 0 ? null : anladim / cevaplanan.length,
      ortalama_ilk_cevap_sn:
        sureler.length === 0
          ? null
          : Math.round(sureler.reduce((a, b) => a + b, 0) / sureler.length),
    };
  };
  const ogretmenIdleri = [
    ...new Set(kume.map((s) => s.ilkCevapYazari).filter((x): x is string => x !== null)),
  ];
  const bransKodlari = [...new Set(kume.map((s) => s.brans_kodu))].sort();
  return {
    baslangic: bas,
    bitis: bit,
    ...satir(kume),
    ogretmenler: ogretmenIdleri.map((id) => ({
      ogretmen_id: id,
      gorunen_ad: adi(id),
      ...satir(kume.filter((s) => s.ilkCevapYazari === id)),
    })),
    branslar: bransKodlari.map((b) => ({
      brans_kodu: b,
      ...satir(kume.filter((s) => s.brans_kodu === b)),
    })),
  };
}
