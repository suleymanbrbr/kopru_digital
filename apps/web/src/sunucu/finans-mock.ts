import { MOCK_KURUM_ROLLERI, mockKurumVerisi } from './hesap-mock';
import type { MockIstek, MockYanit } from './vekil';

/**
 * `NEXT_PUBLIC_API_MOCK=1` iken `/api/finans/*` ucunun bellek ici karsiligi: paket sablonlari, paket
 * satisi, tahsilat, ogrenci karti, ayarlar, aylik ozet ve `.xlsx` indirme. Tutarlar kurus tamsayisidir.
 * Ogrenci rolu yalniz `gorunum: 'ogrenci'` ile kalan dersi gorur. Yalniz deneme ve e2e icindir.
 */

type Kayit = Record<string, unknown>;

type Model = 'paket' | 'ders_basi' | 'yok';

interface OgrFin {
  id: string;
  model: Model;
  odeyenAd: string | null;
  odeyenTelefon: string | null;
  profilSurumu: number | null;
  krediHareketleri: Kayit[];
  bakiyeHareketleri: Kayit[];
}

interface FinansDurumu {
  paketler: Kayit[];
  satislar: Kayit[];
  tahsilatlar: Kayit[];
  ogrenciler: Map<string, OgrFin>;
  tarifeler: Kayit[];
  politika: Kayit;
  ogrenciKalanDersGorur: boolean;
  idempotency: Map<string, { govde: string; yanit: MockYanit }>;
}

const hata = (durum: number, kod: string, mesaj: string): MockYanit => ({
  durum,
  govde: { error: { code: kod, message: mesaj } },
});
const dogrulama = (m = 'İstek doğrulanamadı.') => hata(400, 'dogrulama_hatasi', m);
const bulunamadi = () => hata(404, 'bulunamadi', 'Kaynak bulunamadı.');
const izinYok = () => hata(403, 'izin_yok', 'Bu işlem için yetkin yok.');

const uid = () => crypto.randomUUID();
const simdi = () => new Date().toISOString();
const bugun = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const gunOnce = (g: number) => new Date(Date.now() - g * 86_400_000).toISOString();

const kutu = globalThis as unknown as { __kopruFinansMock?: Record<string, FinansDurumu> };

/** Testler: tum finans verisini bastan kurar. */
export function finansMockSifirla(): void {
  kutu.__kopruFinansMock = undefined;
}

function nesne(govde: unknown): Kayit {
  return typeof govde === 'object' && govde !== null ? (govde as Kayit) : {};
}

function hareket(tur: string, miktar: number, ek: Kayit = {}): Kayit {
  return {
    id: uid(),
    tur,
    miktar,
    paket_satisi_id: null,
    ders_id: null,
    yoklama_id: null,
    yoklama_surumu: null,
    ters_cevrilen_id: null,
    neden: null,
    created_at: simdi(),
    ...ek,
  };
}
function bakiyeHareketi(tur: string, tutar: number, kaynak: string, ek: Kayit = {}): Kayit {
  return {
    id: uid(),
    tur,
    tutar_kurus: tutar,
    kaynak_turu: kaynak,
    kaynak_id: null,
    ders_id: null,
    yoklama_id: null,
    ters_cevrilen_id: null,
    neden: null,
    created_at: simdi(),
    ...ek,
  };
}

const metin = (v: unknown, yedek = ''): string => (typeof v === 'string' ? v : yedek);
const toplam = (liste: Kayit[], alan: string) => liste.reduce((t, h) => t + (h[alan] as number), 0);
const kalanKredi = (o: OgrFin) => toplam(o.krediHareketleri, 'miktar');
const bakiye = (o: OgrFin) => toplam(o.bakiyeHareketleri, 'tutar_kurus');

function kur(kurumId: string): FinansDurumu {
  const v = mockKurumVerisi(kurumId);
  const paketler: Kayit[] = [
    paketYap('8 Derslik Paket', 8, 480_000, 90),
    paketYap('12 Derslik Paket', 12, 660_000, 120),
    paketYap('Tek Ders', 1, 70_000, null),
  ];
  const durum: FinansDurumu = {
    paketler,
    satislar: [],
    tahsilatlar: [],
    ogrenciler: new Map(),
    tarifeler: [],
    politika: {
      geldi_dusurur: true,
      gec_dusurur: true,
      gelmedi_dusurur: true,
      izinli_dusurur: false,
      ogrenci_gec_iptal_dusurur: true,
      gec_iptal_saat: 24,
      dusuk_kredi_esigi: 2,
      varsayilan: true,
    },
    ogrenciKalanDersGorur: true,
    idempotency: new Map(),
  };
  const ogrenciler = v.uyeler.filter((u) => u.rol === 'ogrenci');
  // [model, kalan kredi, bakiye, odeyen ad, odeyen telefon]
  const tohum: [Model, number, number, string | null, string | null][] = [
    ['paket', 8, 0, 'Fatma Demir', '+905321110001'],
    ['paket', 2, 0, 'Hasan Yıldız', '+905321110002'],
    ['paket', 0, -150_000, 'Hatice Şahin', '+905321110003'],
    ['ders_basi', 0, -40_000, null, null],
    ['paket', 1, 0, null, null],
    ['paket', 6, 0, null, null],
  ];
  ogrenciler.forEach((u, i) => {
    const [model, kalan, borc, ad, tel] = tohum[i] ?? (['yok', 0, 0, null, null] as const);
    const o: OgrFin = {
      id: u.uyelik_id,
      model,
      odeyenAd: ad,
      odeyenTelefon: tel,
      profilSurumu: model === 'yok' ? null : 1,
      krediHareketleri: [],
      bakiyeHareketleri: [],
    };
    if (model === 'paket') {
      const adet = Math.max(kalan, 8);
      const paketSatisi = satisYap(o.id, paketler[0] ?? {}, kalan, adet, 'aktif');
      durum.satislar.push(paketSatisi);
      o.krediHareketleri.push(
        hareket('satin_alma', adet, { paket_satisi_id: paketSatisi.id, created_at: gunOnce(20) }),
      );
      if (adet - kalan > 0) {
        o.krediHareketleri.push(hareket('dusum', -(adet - kalan), { created_at: gunOnce(3) }));
      }
      o.bakiyeHareketleri.push(
        bakiyeHareketi('paket_satisi', -480_000, 'paket_satisi', { created_at: gunOnce(20) }),
      );
      const odenen = 480_000 + borc;
      if (odenen > 0) {
        const th = tahsilatYap(
          o.id,
          odenen,
          'havale',
          gunOnce(20).slice(0, 10),
          paketSatisi.id as string,
        );
        durum.tahsilatlar.push(th);
        o.bakiyeHareketleri.push(
          bakiyeHareketi('tahsilat', odenen, 'tahsilat', {
            kaynak_id: th.id,
            created_at: gunOnce(20),
          }),
        );
      }
    } else if (model === 'ders_basi') {
      o.bakiyeHareketleri.push(
        bakiyeHareketi('ders_ucreti', borc, 'yoklama', { created_at: gunOnce(2) }),
      );
    }
    durum.ogrenciler.set(o.id, o);
  });
  return durum;
}

function paketYap(ad: string, kredi: number, fiyat: number, gun: number | null): Kayit {
  return {
    id: uid(),
    ad,
    kredi_adedi: kredi,
    fiyat_kurus: fiyat,
    kredi_politikasi: null,
    gecerlilik_gun: gun,
    grup_turu: null,
    brans_kodu: null,
    aktif: true,
    arsivlendi_at: null,
    surum: 1,
    created_at: gunOnce(30),
  };
}
function satisYap(
  ogrenciId: string,
  paket: Kayit,
  kalan: number,
  toplamKredi: number,
  durum: string,
): Kayit {
  return {
    id: uid(),
    ogrenci_id: ogrenciId,
    paket_id: paket.id,
    ad: paket.ad,
    toplam_kredi: toplamKredi,
    kalan_kredi: kalan,
    fiyat_kurus: paket.fiyat_kurus,
    baslangic_tarihi: gunOnce(20).slice(0, 10),
    bitis_tarihi: null,
    durum,
    satan_id: uid(),
    iptal_at: null,
    created_at: gunOnce(20),
  };
}
function tahsilatYap(
  ogrenciId: string,
  tutar: number,
  yontem: string,
  tarih: string,
  paketSatisiId: string | null,
): Kayit {
  return {
    id: uid(),
    ogrenci_id: ogrenciId,
    tutar_kurus: tutar,
    yontem,
    tahsilat_tarihi: tarih,
    makbuz_no: null,
    paket_satisi_id: paketSatisiId,
    aciklama: null,
    alan_id: uid(),
    durum: 'gecerli',
    iptal_at: null,
    iptal_nedeni: null,
    created_at: simdi(),
  };
}

function durumu(kurumId: string): FinansDurumu {
  kutu.__kopruFinansMock ??= {};
  kutu.__kopruFinansMock[kurumId] ??= kur(kurumId);
  return kutu.__kopruFinansMock[kurumId];
}

/**
 * Ders mock'unun yoklama kaydinda cagirdigi kredi etkisi: yeni ve onceki durumun krediyi dusurup
 * dusurmedigine gore kredi `dusum` ya da `iade`. Yalniz `paket` modelindeki ogrenci etkilenir.
 */
export function finansKrediUygula(
  kurumId: string,
  ogrenciId: string,
  onceki: string | null,
  yeni: string,
  dersId: string,
): { kalanKredi: number | null; uyari: 'ucret_tarifesi_yok' | null } {
  const f = durumu(kurumId);
  const o = f.ogrenciler.get(ogrenciId);
  if (!o) return { kalanKredi: null, uyari: null };
  if (o.model === 'ders_basi') {
    return { kalanKredi: null, uyari: f.tarifeler.length === 0 ? 'ucret_tarifesi_yok' : null };
  }
  if (o.model !== 'paket') return { kalanKredi: null, uyari: null };
  const dusurur = (d: string | null) =>
    d === 'geldi' || d === 'gec' || d === 'gelmedi' ? f.politika[`${d}_dusurur`] === true : false;
  const delta = (dusurur(yeni) ? 1 : 0) - (dusurur(onceki) ? 1 : 0);
  if (delta === 0) return { kalanKredi: null, uyari: null };
  o.krediHareketleri.push(
    delta > 0
      ? hareket('dusum', -1, { ders_id: dersId })
      : hareket('iade', 1, { ders_id: dersId, neden: 'Yoklama düzeltildi' }),
  );
  return { kalanKredi: kalanKredi(o), uyari: null };
}

// --- Gorunumler ------------------------------------------------------------------------------

function adi(kurumId: string, ogrenciId: string): string | null {
  const u = mockKurumVerisi(kurumId).uyeler.find((x) => x.uyelik_id === ogrenciId);
  return u ? u.gorunen_ad : null;
}

function satirOlustur(kurumId: string, f: FinansDurumu, o: OgrFin): Kayit {
  const kalan = kalanKredi(o);
  const b = bakiye(o);
  return {
    ogrenci_id: o.id,
    gorunen_ad: adi(kurumId, o.id),
    model: o.model,
    kalan_kredi: kalan,
    dusuk_kredi: o.model === 'paket' && kalan <= (f.politika.dusuk_kredi_esigi as number),
    bakiye_kurus: b,
    borclu: b < 0,
  };
}

function etkinPaketler(f: FinansDurumu, o: OgrFin): Kayit[] {
  return f.satislar.filter((s) => s.ogrenci_id === o.id && s.durum === 'aktif');
}

function kapsamdakiOgrenciler(kurumId: string, f: FinansDurumu): OgrFin[] {
  const rol = MOCK_KURUM_ROLLERI[kurumId];
  const tum = [...f.ogrenciler.values()];
  if (rol !== 'ogretmen') return tum;
  const v = mockKurumVerisi(kurumId);
  const ogretmenId = v.uyeler.find((u) => u.rol === 'ogretmen')?.uyelik_id;
  const gruplar = v.atamalar.filter((a) => a.ogretmen_id === ogretmenId).map((a) => a.grup_id);
  const uyeler = new Set(
    gruplar.flatMap((gid) =>
      (v.grupUyeleri[gid as string] ?? []).map((u) => u.ogrenci_id as string),
    ),
  );
  return tum.filter((o) => uyeler.has(o.id));
}

function sayfala<T extends { id?: unknown; ogrenci_id?: unknown }>(
  liste: T[],
  sorgu: URLSearchParams,
  anahtar: 'id' | 'ogrenci_id' = 'id',
) {
  const limit = Math.min(Math.max(Number(sorgu.get('limit') ?? 50) || 50, 1), 200);
  const imlec = sorgu.get('imlec');
  const basla = imlec ? liste.findIndex((o) => o[anahtar] === imlec) + 1 : 0;
  const dilim = liste.slice(basla, basla + limit);
  const sonraki =
    basla + limit < liste.length ? (dilim[dilim.length - 1]?.[anahtar] as string) : null;
  return { dilim, sonraki };
}

const XLSX_BAYT = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00]);

function odemeYaz(
  f: FinansDurumu,
  o: OgrFin,
  satis: Kayit,
  odeme: Kayit,
): { tahsilat: Kayit | null; hata?: MockYanit } {
  const tur = odeme.tur;
  if (tur === 'sonra' || tur === undefined) return { tahsilat: null };
  const fiyat = satis.fiyat_kurus as number;
  const tutar = tur === 'tamami' ? fiyat : odeme.tutar_kurus;
  if (typeof tutar !== 'number' || !Number.isInteger(tutar) || tutar <= 0) {
    return { tahsilat: null, hata: dogrulama() };
  }
  if (tur === 'kismi' && tutar >= fiyat) {
    return {
      tahsilat: null,
      hata: hata(422, 'odeme_gecersiz', 'Kısmi tutar paket fiyatından az olmalı.'),
    };
  }
  const th = tahsilatYap(
    o.id,
    tutar,
    typeof odeme.yontem === 'string' ? odeme.yontem : 'nakit',
    bugun(),
    satis.id as string,
  );
  f.tahsilatlar.push(th);
  o.bakiyeHareketleri.push(bakiyeHareketi('tahsilat', tutar, 'tahsilat', { kaynak_id: th.id }));
  return { tahsilat: th };
}

export function finansMock(istek: MockIstek): MockYanit {
  const parcalar = istek.yol.split('/');
  const kurumId = parcalar[1];
  if (parcalar[0] !== 'kurumlar' || !kurumId || !(kurumId in MOCK_KURUM_ROLLERI))
    return bulunamadi();
  const rol = MOCK_KURUM_ROLLERI[kurumId];
  const f = durumu(kurumId);
  const { yontem, sorgu } = istek;
  const g = nesne(istek.govde);
  const [kaynak, id, alt] = parcalar.slice(2);
  const personel = rol !== 'ogrenci';
  const yonetim = rol === 'sahip' || rol === 'yonetici';

  // --- Ogrenci karti (ogrenci rolu yalniz kendisi) ---
  if (kaynak === 'ogrenciler' && id && alt === 'finans' && yontem === 'GET') {
    // Mock oturumunda ogrenci kimligi uuid degildir: ogrenci rolu her zaman kendi (deneme) kartini gorur.
    const o = personel ? f.ogrenciler.get(id) : [...f.ogrenciler.values()][1];
    if (!o) return bulunamadi();
    if (!personel) {
      return {
        durum: 200,
        govde: {
          gorunum: 'ogrenci',
          ogrenci_id: o.id,
          kalan_kredi: f.ogrenciKalanDersGorur ? kalanKredi(o) : null,
        },
      };
    }
    return {
      durum: 200,
      govde: {
        gorunum: 'tam',
        ogrenci_id: id,
        model: o.model,
        kalan_kredi: kalanKredi(o),
        dusuk_kredi_esigi: f.politika.dusuk_kredi_esigi,
        bakiye_kurus: bakiye(o),
        borclu: bakiye(o) < 0,
        etkin_paketler: etkinPaketler(f, o),
        son_kredi_hareketleri: [...o.krediHareketleri].reverse().slice(0, 10),
        son_bakiye_hareketleri: [...o.bakiyeHareketleri].reverse().slice(0, 10),
        odeyen_ad: o.odeyenAd,
        odeyen_telefon: o.odeyenTelefon,
      },
    };
  }
  if (!personel) return izinYok();

  if (kaynak === 'ogrenciler' && !id && yontem === 'GET') {
    const borclu =
      sorgu.has('borclu') && sorgu.get('borclu') !== 'false' && sorgu.get('borclu') !== '0';
    const dusuk =
      sorgu.has('dusuk_kredi') &&
      sorgu.get('dusuk_kredi') !== 'false' &&
      sorgu.get('dusuk_kredi') !== '0';
    const q = (sorgu.get('q') ?? '').toLocaleLowerCase('tr');
    const satirlar = kapsamdakiOgrenciler(kurumId, f)
      .map((o) => satirOlustur(kurumId, f, o))
      .filter(
        (s) =>
          (!borclu || s.borclu === true) &&
          (!dusuk || s.dusuk_kredi === true) &&
          (!q || metin(s.gorunen_ad).toLocaleLowerCase('tr').includes(q)),
      )
      .sort((a, b) => String(a.gorunen_ad).localeCompare(String(b.gorunen_ad), 'tr'));
    const { dilim, sonraki } = sayfala(satirlar, sorgu, 'ogrenci_id');
    return {
      durum: 200,
      govde: {
        ogrenciler: dilim,
        dusuk_kredi_esigi: f.politika.dusuk_kredi_esigi,
        kapsam: yonetim ? 'kurum' : 'grup',
        sonraki_imlec: sonraki,
      },
    };
  }

  if (kaynak === 'ogrenciler' && id) {
    const o = f.ogrenciler.get(id);
    if (!o) return bulunamadi();
    if (alt === 'finans-profili') {
      if (yontem === 'GET') {
        return {
          durum: 200,
          govde: {
            ogrenci_id: id,
            model: o.model,
            odeyen_ad: o.odeyenAd,
            odeyen_telefon: o.odeyenTelefon,
            surum: o.profilSurumu,
          },
        };
      }
      if (yontem === 'PUT') {
        if (typeof g.model === 'string') o.model = g.model as Model;
        if (g.odeyen_ad !== undefined) o.odeyenAd = g.odeyen_ad as string | null;
        if (g.odeyen_telefon !== undefined) o.odeyenTelefon = g.odeyen_telefon as string | null;
        o.profilSurumu = (o.profilSurumu ?? 0) + 1;
        return {
          durum: 200,
          govde: {
            ogrenci_id: id,
            model: o.model,
            odeyen_ad: o.odeyenAd,
            odeyen_telefon: o.odeyenTelefon,
            surum: o.profilSurumu,
          },
        };
      }
    }
    if ((alt === 'kredi-hareketleri' || alt === 'bakiye-hareketleri') && yontem === 'GET') {
      const kredi = alt === 'kredi-hareketleri';
      const liste = [...(kredi ? o.krediHareketleri : o.bakiyeHareketleri)].reverse();
      const { dilim, sonraki } = sayfala(liste, sorgu);
      return {
        durum: 200,
        govde: kredi
          ? { hareketler: dilim, kalan_kredi: kalanKredi(o), sonraki_imlec: sonraki }
          : { hareketler: dilim, bakiye_kurus: bakiye(o), sonraki_imlec: sonraki },
      };
    }
    return bulunamadi();
  }

  // --- Paket sablonlari ---
  if (kaynak === 'paketler') {
    if (yontem === 'GET' && !id) {
      const d = sorgu.get('durum') ?? 'aktif';
      const liste = f.paketler.filter(
        (p) => d === 'hepsi' || (d === 'arsiv' ? p.aktif === false : p.aktif === true),
      );
      const { dilim, sonraki } = sayfala(liste, sorgu);
      return { durum: 200, govde: { paketler: dilim, sonraki_imlec: sonraki } };
    }
    if (!yonetim) return izinYok();
    if (yontem === 'POST' && !id) {
      if (
        typeof g.ad !== 'string' ||
        typeof g.kredi_adedi !== 'number' ||
        typeof g.fiyat_kurus !== 'number'
      ) {
        return dogrulama();
      }
      const p = paketYap(
        g.ad,
        g.kredi_adedi,
        g.fiyat_kurus,
        (g.gecerlilik_gun as number | null) ?? null,
      );
      f.paketler.push(p);
      return { durum: 201, govde: p };
    }
    const p = f.paketler.find((x) => x.id === id);
    if (!p) return bulunamadi();
    if (yontem === 'PATCH') {
      if (p.aktif === false) return hata(409, 'paket_arsivde', 'Arşivlenmiş paket düzenlenemez.');
      Object.assign(p, g, { surum: (p.surum as number) + 1 });
      return { durum: 200, govde: p };
    }
    if (yontem === 'POST' && alt === 'arsivle') {
      p.aktif = false;
      p.arsivlendi_at = simdi();
      return { durum: 200, govde: p };
    }
  }

  // --- Paket satisi ---
  if (kaynak === 'paket-satislari' && yontem === 'POST' && !id) {
    const o = typeof g.ogrenci_id === 'string' ? f.ogrenciler.get(g.ogrenci_id) : undefined;
    const paket = f.paketler.find((p) => p.id === g.paket_id);
    if (!o || !paket) return dogrulama();
    if (o.model !== 'paket') {
      return hata(422, 'ogrenci_modeli_paket_degil', 'Öğrencinin ödeme modeli paket değil.');
    }
    if (paket.aktif === false) return hata(409, 'paket_arsivde', 'Paket arşivlenmiş.');
    const s = satisYap(
      o.id,
      paket,
      paket.kredi_adedi as number,
      paket.kredi_adedi as number,
      'aktif',
    );
    s.baslangic_tarihi = typeof g.baslangic_tarihi === 'string' ? g.baslangic_tarihi : bugun();
    const sonuc = odemeYaz(f, o, s, nesne(g.odeme));
    if (sonuc.hata) return sonuc.hata;
    f.satislar.push(s);
    o.krediHareketleri.push(
      hareket('satin_alma', paket.kredi_adedi as number, { paket_satisi_id: s.id }),
    );
    o.bakiyeHareketleri.push(
      bakiyeHareketi('paket_satisi', -(paket.fiyat_kurus as number), 'paket_satisi', {
        kaynak_id: s.id,
      }),
    );
    return {
      durum: 201,
      govde: {
        satis: s,
        tahsilat: sonuc.tahsilat,
        kalan_kredi: kalanKredi(o),
        bakiye_kurus: bakiye(o),
      },
    };
  }
  if (kaynak === 'paket-satislari' && yontem === 'POST' && id && alt === 'iptal') {
    const s = f.satislar.find((x) => x.id === id);
    if (!s) return bulunamadi();
    if (s.durum === 'iptal')
      return hata(409, 'paket_iptal_edilmis', 'Paket satışı zaten iptal edilmiş.');
    if (s.kalan_kredi !== s.toplam_kredi) {
      return hata(409, 'paket_kullanilmis', 'Kullanılmış paket iptal edilemez.');
    }
    const o = f.ogrenciler.get(s.ogrenci_id as string);
    if (!o) return bulunamadi();
    s.durum = 'iptal';
    s.iptal_at = simdi();
    o.krediHareketleri.push(
      hareket('ters_kayit', -(s.toplam_kredi as number), {
        paket_satisi_id: s.id,
        neden: metin(g.neden),
      }),
    );
    o.bakiyeHareketleri.push(
      bakiyeHareketi('ters_kayit', s.fiyat_kurus as number, 'paket_satisi', { kaynak_id: s.id }),
    );
    return { durum: 200, govde: s };
  }

  // --- Tahsilat ---
  if (kaynak === 'tahsilatlar') {
    if (yontem === 'GET' && !id) {
      const ogr = sorgu.get('ogrenci_id');
      const ay = sorgu.get('ay');
      const d = sorgu.get('durum') ?? 'hepsi';
      const liste = [...f.tahsilatlar]
        .reverse()
        .filter(
          (t) =>
            (!ogr || t.ogrenci_id === ogr) &&
            (!ay || String(t.tahsilat_tarihi).startsWith(ay)) &&
            (d === 'hepsi' || t.durum === d),
        );
      const { dilim, sonraki } = sayfala(liste, sorgu);
      return {
        durum: 200,
        govde: { tahsilatlar: dilim, kapsam: yonetim ? 'kurum' : 'grup', sonraki_imlec: sonraki },
      };
    }
    if (yontem === 'POST' && !id) {
      const anahtar = istek.basliklar['idempotency-key'];
      const ham = JSON.stringify(istek.govde ?? null);
      if (anahtar) {
        const onceki = f.idempotency.get(anahtar);
        if (onceki) {
          if (onceki.govde !== ham) {
            return hata(409, 'istek_cakismasi', 'Bu anahtar başka bir istekle kullanılmış.');
          }
          return {
            durum: 200,
            govde: { ...(onceki.yanit.govde as Kayit), tekrar: true },
          };
        }
      }
      const o = typeof g.ogrenci_id === 'string' ? f.ogrenciler.get(g.ogrenci_id) : undefined;
      if (!o) return bulunamadi();
      const tutar = g.tutar_kurus;
      if (typeof tutar !== 'number' || !Number.isInteger(tutar) || tutar <= 0) return dogrulama();
      const tarih = typeof g.tahsilat_tarihi === 'string' ? g.tahsilat_tarihi : bugun();
      if (tarih > bugun()) return hata(422, 'odeme_gecersiz', 'Ödeme tarihi gelecekte olamaz.');
      const th = tahsilatYap(o.id, tutar, metin(g.yontem, 'nakit'), tarih, null);
      if (typeof g.makbuz_no === 'string') th.makbuz_no = g.makbuz_no;
      if (typeof g.aciklama === 'string') th.aciklama = g.aciklama;
      f.tahsilatlar.push(th);
      o.bakiyeHareketleri.push(bakiyeHareketi('tahsilat', tutar, 'tahsilat', { kaynak_id: th.id }));
      const yanit: MockYanit = { durum: 201, govde: { ...th, tekrar: false } };
      if (anahtar) f.idempotency.set(anahtar, { govde: ham, yanit });
      return yanit;
    }
    if (yontem === 'POST' && id && alt === 'iptal') {
      const th = f.tahsilatlar.find((x) => x.id === id);
      if (!th) return bulunamadi();
      if (th.durum === 'iptal')
        return hata(409, 'tahsilat_iptal_edilmis', 'Tahsilat zaten iptal edilmiş.');
      const o = f.ogrenciler.get(th.ogrenci_id as string);
      if (!o) return bulunamadi();
      th.durum = 'iptal';
      th.iptal_at = simdi();
      th.iptal_nedeni = metin(g.neden);
      o.bakiyeHareketleri.push(
        bakiyeHareketi('ters_kayit', -(th.tutar_kurus as number), 'tahsilat', {
          kaynak_id: th.id,
          neden: th.iptal_nedeni as string,
        }),
      );
      return { durum: 200, govde: { ...th, tekrar: false } };
    }
  }

  // --- Ayarlar, politika, tarifeler ---
  if (kaynak === 'kredi-politikasi') {
    if (yontem === 'GET') return { durum: 200, govde: f.politika };
    if (yontem === 'PUT') {
      if (!yonetim) return izinYok();
      Object.assign(f.politika, g, { varsayilan: false });
      return { durum: 200, govde: f.politika };
    }
  }
  if (kaynak === 'ayarlar') {
    if (yontem === 'GET') {
      return { durum: 200, govde: { ogrenci_kalan_ders_gorur: f.ogrenciKalanDersGorur } };
    }
    if (yontem === 'PUT') {
      if (!yonetim) return izinYok();
      if (typeof g.ogrenci_kalan_ders_gorur === 'boolean') {
        f.ogrenciKalanDersGorur = g.ogrenci_kalan_ders_gorur;
      }
      return { durum: 200, govde: { ogrenci_kalan_ders_gorur: f.ogrenciKalanDersGorur } };
    }
  }
  if (kaynak === 'ucret-tarifeleri') {
    if (yontem === 'GET' && !id) return { durum: 200, govde: { tarifeler: f.tarifeler } };
    if (!yonetim) return izinYok();
    if (yontem === 'POST' && !id) {
      if (typeof g.ucret_kurus !== 'number' || typeof g.gecerlilik_baslangic !== 'string') {
        return dogrulama();
      }
      const t = {
        id: uid(),
        ogrenci_id: g.ogrenci_id ?? null,
        grup_id: g.grup_id ?? null,
        brans_kodu: g.brans_kodu ?? null,
        ucret_kurus: g.ucret_kurus,
        gecerlilik_baslangic: g.gecerlilik_baslangic,
        gecerlilik_bitis: g.gecerlilik_bitis ?? null,
        surum: 1,
      };
      f.tarifeler.push(t);
      return { durum: 201, govde: t };
    }
    const t = f.tarifeler.find((x) => x.id === id);
    if (!t) return bulunamadi();
    if (yontem === 'PATCH') {
      Object.assign(t, g, { surum: (t.surum as number) + 1 });
      return { durum: 200, govde: t };
    }
    if (yontem === 'DELETE') {
      f.tarifeler.splice(f.tarifeler.indexOf(t), 1);
      return { durum: 204 };
    }
  }

  // --- Ozet ve disa aktarim ---
  if (kaynak === 'ozet' && id === 'aylik' && yontem === 'GET') {
    const ay = sorgu.get('ay');
    if (!ay || !/^\d{4}-(0[1-9]|1[0-2])$/.test(ay)) return dogrulama();
    const gecerli = f.tahsilatlar.filter(
      (t) => t.durum === 'gecerli' && String(t.tahsilat_tarihi).startsWith(ay),
    );
    const yontemler = [...new Set(gecerli.map((t) => t.yontem as string))];
    return {
      durum: 200,
      govde: {
        ay,
        toplam_kurus: toplam(gecerli, 'tutar_kurus'),
        tahsilat_sayisi: gecerli.length,
        yonteme_gore: yontemler.map((y) => {
          const grup = gecerli.filter((t) => t.yontem === y);
          return { yontem: y, toplam_kurus: toplam(grup, 'tutar_kurus'), adet: grup.length };
        }),
        kapsam: yonetim ? 'kurum' : 'grup',
      },
    };
  }
  if (kaynak === 'disa-aktar' && yontem === 'GET') {
    const ay = sorgu.get('ay');
    if (!ay || !/^\d{4}-(0[1-9]|1[0-2])$/.test(ay)) return dogrulama();
    return {
      durum: 200,
      ikili: {
        bayt: XLSX_BAYT,
        tur: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dosyaAdi: `finans-${ay}.xlsx`,
      },
    };
  }

  return bulunamadi();
}
