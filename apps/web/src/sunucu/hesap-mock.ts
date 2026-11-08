/**
 * `NEXT_PUBLIC_API_MOCK=1` iken `/api/hesap/*` ucunun bellek ici karsiligi: gruplar, uyeler,
 * atamalar, sinif katilim kodu, davetler, oturumlar. Yanit sekilleri `@kopru/contracts` ile aynidir.
 * Deneme rolleri kurumdan gelir (`mock.ts`): `kurum-ege` ogretmen (grup yazamaz), digerleri yazabilir.
 * Yalniz deneme ve e2e icindir; veri sunucu sureci yeniden baslayana kadar bellekte kalir.
 */

interface Istek {
  yontem: string;
  /** `/v1/hesap/` sonrasi yol. */
  yol: string;
  sorgu: URLSearchParams;
  govde: unknown;
}
interface Yanit {
  durum: number;
  govde?: unknown;
}

type Kayit = Record<string, unknown>;

const ALFABE = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const MOCK_KULLANICI_ID = '00000000-0000-4000-8000-0000000000aa';

const KURUM_ADLARI: Record<string, string> = {
  'kurum-ege': 'Ege Işık Dershanesi',
  'kurum-mavi': 'Mavi Kule Kurs Merkezi',
  'kurum-atlas': 'Atlas Etüt Merkezi',
  'kurum-kuzey': 'Kuzey Yıldızı Akademi',
};
const SINIF_KODLARI: Record<string, string> = {
  'kurum-ege': 'EGEK2345',
  'kurum-mavi': 'MAVK2345',
  'kurum-atlas': 'ATLS2345',
  'kurum-kuzey': 'KUZEY234',
};

function ilk<T>(oge: T | undefined): T {
  if (oge === undefined) throw new Error('mock verisi eksik');
  return oge;
}

const uid = () => crypto.randomUUID();
const simdi = () => new Date().toISOString();
const gunOnce = (g: number) => new Date(Date.now() - g * 86_400_000).toISOString();
const gunSonra = (g: number) => new Date(Date.now() + g * 86_400_000).toISOString();
const tarih = (iso: string) => iso.slice(0, 10);

function rastgele(uzunluk: number, alfabe = ALFABE): string {
  let s = '';
  for (let i = 0; i < uzunluk; i += 1)
    s += alfabe.charAt(Math.floor(Math.random() * alfabe.length));
  return s;
}

const hata = (durum: number, kod: string, mesaj: string): Yanit => ({
  durum,
  govde: { error: { code: kod, message: mesaj } },
});
const izinYok = () => hata(403, 'izin_yok', 'Bu işlem için yetkin yok.');
const bulunamadi = () => hata(404, 'bulunamadi', 'Kaynak bulunamadı.');
const dogrulama = (mesaj = 'İstek doğrulanamadı.') => hata(400, 'dogrulama_hatasi', mesaj);

interface Grup extends Kayit {
  id: string;
  tur: string;
  ad: string;
  kapasite: number | null;
  renk: string | null;
  durum: 'aktif' | 'arsiv';
  surum: number;
}
interface Uye extends Kayit {
  uyelik_id: string;
  rol: string;
  gorunen_ad: string;
}
interface Davet extends Kayit {
  id: string;
}

interface KurumDurumu {
  yazabilir: boolean;
  gruplar: Grup[];
  grupUyeleri: Record<string, Kayit[]>;
  atamalar: Kayit[];
  kodlar: Record<string, Kayit | null>;
  istekler: Record<string, Kayit[]>;
  davetler: Davet[];
  uyeler: Uye[];
}

interface Depo {
  kurumlar: Record<string, KurumDurumu>;
  oturumlar: Kayit[];
}

const OGRENCI_ADLARI = [
  'Ayşe Demir',
  'Çağlar Yıldız',
  'Elif Şahin',
  'Mehmet Öztürk',
  'Zeynep Kaya',
  'İbrahim Arslan',
  'Ömer Faruk Çelik',
  'Şule Aydın',
  'Ahmet Güneş',
  'Ece Korkmaz',
];
const OGRETMEN_ADLARI = ['Burcu Tekin', 'Hasan Polat', 'Gül Yücel'];

function grupYap(tur: string, ad: string, ek: Partial<Grup> = {}): Grup {
  return {
    id: uid(),
    tur,
    ad,
    sube_id: null,
    kademe_id: null,
    kapasite: null,
    renk: null,
    durum: 'aktif',
    arsivlendi_at: null,
    surum: 1,
    created_at: gunOnce(20),
    ...ek,
  };
}

function kurumKur(kurumId: string): KurumDurumu {
  const uyeler: Uye[] = [
    ...OGRENCI_ADLARI.map((ad) => ({
      uyelik_id: uid(),
      kullanici_id: uid(),
      rol: 'ogrenci',
      durum: 'aktif',
      gorunen_ad: ad,
      sube_id: null,
      kademe_id: null,
      katildi_at: gunOnce(12),
    })),
    ...OGRETMEN_ADLARI.map((ad) => ({
      uyelik_id: uid(),
      kullanici_id: uid(),
      rol: 'ogretmen',
      durum: 'aktif',
      gorunen_ad: ad,
      sube_id: null,
      kademe_id: null,
      katildi_at: gunOnce(30),
    })),
  ];
  const ogrenciler = uyeler.filter((u) => u.rol === 'ogrenci');
  const sinif = grupYap('sinif', '9-A Sınıfı', { kapasite: 30, renk: '#2E6FF2' });
  const etut = grupYap('etut', 'Matematik Etüdü', { kapasite: 12 });
  const grup = grupYap('grup', 'LGS Hazırlık Grubu', { kapasite: 8, renk: '#0E9F8E' });
  const birebir = grupYap('birebir', 'Çağlar ile birebir', { kapasite: 1 });
  const eski = grupYap('grup', 'Eski Yaz Kampı', {
    durum: 'arsiv',
    arsivlendi_at: gunOnce(3),
  });
  const gruplar = [sinif, etut, grup, birebir, eski];

  const uyeYap = (grupId: string, ogr: Uye, yol: string) => ({
    id: uid(),
    grup_id: grupId,
    ogrenci_id: ogr.uyelik_id,
    gorunen_ad: ogr.gorunen_ad,
    baslangic_tarihi: tarih(gunOnce(10)),
    bitis_tarihi: null,
    katilim_yolu: yol,
  });
  const grupUyeleri: Record<string, Kayit[]> = {
    [sinif.id]: ogrenciler.slice(0, 6).map((o) => uyeYap(sinif.id, o, 'yonetici')),
    [etut.id]: ogrenciler.slice(2, 5).map((o) => uyeYap(etut.id, o, 'davet')),
    [grup.id]: ogrenciler.slice(4, 6).map((o) => uyeYap(grup.id, o, 'yonetici')),
    [birebir.id]: [uyeYap(birebir.id, ilk(ogrenciler[1]), 'davet')],
    [eski.id]: [],
  };

  const ogretmen = ilk(uyeler.find((u) => u.rol === 'ogretmen'));
  const atamalar = [
    {
      id: uid(),
      grup_id: sinif.id,
      ogretmen_id: ogretmen.uyelik_id,
      ogretmen_ad: ogretmen.gorunen_ad,
      brans_kodu: 'matematik',
      baslangic_tarihi: tarih(gunOnce(9)),
      bitis_tarihi: null,
      ana_ogretmen: true,
    },
  ];

  const kodSatiri = {
    id: uid(),
    grup_id: sinif.id,
    kod: SINIF_KODLARI[kurumId] ?? rastgele(8),
    aktif: true,
    expires_at: gunSonra(30),
    max_kullanim: 30,
    kullanim_sayisi: 6,
    iptal_at: null,
    created_at: gunOnce(5),
  };
  const istekYap = (ad: string, durum: string, kullaniciId = uid()) => ({
    id: uid(),
    grup_id: sinif.id,
    kullanici_id: kullaniciId,
    gorunen_ad: ad,
    durum,
    karar_veren_id: durum === 'bekliyor' ? null : uid(),
    karar_at: durum === 'bekliyor' ? null : gunOnce(1),
    created_at: gunOnce(1),
  });

  const davetYap = (ek: Partial<Davet> & { kanal: string; rol: string; durum: string }): Davet => ({
    id: uid(),
    hedef_telefon_e164: null,
    hedef_eposta: null,
    hedef_ad: null,
    grup_id: null,
    kademe_id: null,
    sube_id: null,
    davet_eden_id: uid(),
    max_kullanim: 1,
    kullanim_sayisi: 0,
    gonderim_sayisi: 0,
    son_gonderim_at: null,
    expires_at: gunSonra(5),
    created_at: gunOnce(2),
    ...ek,
  });
  const davetler = [
    davetYap({
      kanal: 'sms',
      rol: 'ogrenci',
      durum: 'bekliyor',
      hedef_ad: 'Selin Aksoy',
      hedef_telefon_e164: '+905321110022',
      gonderim_sayisi: 1,
      son_gonderim_at: gunOnce(1),
      grup_id: sinif.id,
    }),
    davetYap({
      kanal: 'eposta',
      rol: 'ogretmen',
      durum: 'bekliyor',
      hedef_ad: 'Kemal Işık',
      hedef_eposta: 'kemal@ornek.test',
      gonderim_sayisi: 2,
      son_gonderim_at: gunOnce(1),
    }),
    davetYap({ kanal: 'baglanti', rol: 'ogrenci', durum: 'bekliyor', max_kullanim: 5 }),
    davetYap({
      kanal: 'sms',
      rol: 'ogrenci',
      durum: 'kullanildi',
      hedef_ad: 'Deniz Yalçın',
      hedef_telefon_e164: '+905329998877',
      kullanim_sayisi: 1,
      gonderim_sayisi: 1,
    }),
    davetYap({
      kanal: 'baglanti',
      rol: 'ogretmen',
      durum: 'suresi_doldu',
      expires_at: gunOnce(1),
      created_at: gunOnce(9),
    }),
    davetYap({ kanal: 'sms', rol: 'ogrenci', durum: 'iptal', hedef_ad: 'Arda Kılıç' }),
  ];

  return {
    yazabilir: kurumId !== 'kurum-ege',
    gruplar,
    grupUyeleri,
    atamalar,
    kodlar: { [sinif.id]: kodSatiri },
    istekler: {
      [sinif.id]: [
        istekYap('Burak Tuna', 'bekliyor'),
        istekYap('Defne Çakır', 'bekliyor'),
        istekYap('Ege Sarı', 'onaylandi'),
      ],
    },
    davetler,
    uyeler,
  };
}

function oturumlariKur(): Kayit[] {
  return [
    {
      id: uid(),
      created_at: gunOnce(1),
      son_kullanim_at: simdi(),
      expires_at: gunSonra(29),
      cihaz: 'Chrome · macOS',
      ip_maskeli: '88.231.*.*',
      bu_oturum: true,
    },
    {
      id: uid(),
      created_at: gunOnce(6),
      son_kullanim_at: gunOnce(2),
      expires_at: gunSonra(24),
      cihaz: 'Köprü uygulaması · iPhone',
      ip_maskeli: '176.88.*.*',
      bu_oturum: false,
    },
    {
      id: uid(),
      created_at: gunOnce(14),
      son_kullanim_at: gunOnce(9),
      expires_at: gunSonra(16),
      cihaz: 'Firefox · Windows',
      ip_maskeli: '31.145.*.*',
      bu_oturum: false,
    },
  ];
}

const kutu = globalThis as unknown as { __kopruHesapMock?: Depo };
function depo(): Depo {
  kutu.__kopruHesapMock ??= { kurumlar: {}, oturumlar: oturumlariKur() };
  return kutu.__kopruHesapMock;
}

/** Testler ve ekran goruntuleri icin: tum deneme verisini bastan kurar. */
export function hesapMockSifirla(): void {
  kutu.__kopruHesapMock = undefined;
}

function kurum(kurumId: string): KurumDurumu {
  const d = depo();
  d.kurumlar[kurumId] ??= kurumKur(kurumId);
  return d.kurumlar[kurumId];
}

function sayfala<T extends { id?: unknown }>(liste: T[], sorgu: URLSearchParams) {
  const limit = Math.min(Math.max(Number(sorgu.get('limit') ?? 50) || 50, 1), 200);
  const imlec = sorgu.get('imlec');
  const basla = imlec ? liste.findIndex((o) => o.id === imlec) + 1 : 0;
  const dilim = liste.slice(basla, basla + limit);
  const sonraki = basla + limit < liste.length ? (dilim[dilim.length - 1]?.id as string) : null;
  return { dilim, sonraki };
}

function govdeNesnesi(govde: unknown): Kayit {
  return typeof govde === 'object' && govde !== null ? (govde as Kayit) : {};
}

function grupSatiri(k: KurumDurumu, g: Grup): Kayit {
  const uyeSayisi = (k.grupUyeleri[g.id] ?? []).filter((u) => u.bitis_tarihi === null).length;
  return { ...g, uye_sayisi: uyeSayisi };
}

function telefonNormalle(ham: unknown): string | null {
  if (typeof ham !== 'string') return null;
  let r = ham.replace(/\D/g, '');
  if (r.startsWith('90') && r.length === 12) r = r.slice(2);
  if (r.startsWith('0') && r.length === 11) r = r.slice(1);
  return /^5\d{9}$/.test(r) ? `+90${r}` : null;
}

function davetOlustur(k: KurumDurumu, g: Kayit): Yanit | { davet: Davet; belirtec: string } {
  const kanal = String(g.kanal);
  const rol = String(g.rol);
  if (!['baglanti', 'sms', 'eposta'].includes(kanal)) return dogrulama();
  if (!['yonetici', 'ogretmen', 'ogrenci'].includes(rol)) return dogrulama();
  if (rol !== 'ogrenci' && !k.yazabilir) return izinYok();
  let telefon: string | null = null;
  if (kanal === 'sms') {
    telefon = telefonNormalle(g.telefon);
    if (!telefon) return hata(400, 'gecersiz_telefon', 'Telefon numarası geçersiz.');
  }
  if (kanal === 'eposta' && typeof g.eposta !== 'string') return dogrulama('E-posta gerekli.');
  const davet: Davet = {
    id: uid(),
    kanal,
    rol,
    durum: 'bekliyor',
    hedef_telefon_e164: telefon,
    hedef_eposta: kanal === 'eposta' ? String(g.eposta) : null,
    hedef_ad: typeof g.hedef_ad === 'string' ? g.hedef_ad : null,
    grup_id: typeof g.grup_id === 'string' ? g.grup_id : null,
    kademe_id: null,
    sube_id: null,
    davet_eden_id: MOCK_KULLANICI_ID,
    max_kullanim: typeof g.max_kullanim === 'number' ? g.max_kullanim : 1,
    kullanim_sayisi: 0,
    gonderim_sayisi: kanal === 'baglanti' ? 0 : 1,
    son_gonderim_at: kanal === 'baglanti' ? null : simdi(),
    expires_at: gunSonra(typeof g.gecerlilik_gun === 'number' ? g.gecerlilik_gun : 7),
    created_at: simdi(),
  };
  k.davetler.unshift(davet);
  return { davet, belirtec: rastgele(43, 'abcdefghijklmnopqrstuvwxyz0123456789') };
}

function istekleriBul(depoK: Depo, kullaniciId: string) {
  const sonuc: Kayit[] = [];
  for (const [kurumId, k] of Object.entries(depoK.kurumlar)) {
    for (const [grupId, liste] of Object.entries(k.istekler)) {
      const grup = k.gruplar.find((g) => g.id === grupId);
      for (const i of liste) {
        if (i.kullanici_id !== kullaniciId) continue;
        sonuc.push({
          id: i.id,
          kurum_id: kurumId,
          kurum_ad: KURUM_ADLARI[kurumId] ?? null,
          grup_id: grupId,
          grup_ad: grup?.ad ?? null,
          durum: i.durum,
          karar_at: i.karar_at,
          created_at: i.created_at,
        });
      }
    }
  }
  return sonuc;
}

function kodNormalle(ham: string): string {
  return ham.replace(/[\s-]/g, '').toUpperCase();
}

function kurumdaIsle(kurumId: string, kalan: string[], istek: Istek): Yanit {
  const k = kurum(kurumId);
  const { yontem, sorgu } = istek;
  const g = govdeNesnesi(istek.govde);
  const [kaynak, id, alt, altId, eylem] = kalan;

  // --- uyelikler ---
  if (kaynak === 'uyelikler' && yontem === 'GET' && !id) {
    const rol = sorgu.get('rol');
    const liste = k.uyeler
      .filter((u) => !rol || u.rol === rol)
      .map((u) => ({ ...u, id: u.uyelik_id }));
    const { dilim, sonraki } = sayfala(liste, sorgu);
    return {
      durum: 200,
      govde: {
        uyeler: dilim.map(({ id: _id, ...u }) => u),
        kapsam: 'kurum',
        sonraki_imlec: sonraki,
      },
    };
  }

  // --- atamalar (kurum geneli) ---
  if (kaynak === 'atamalar') {
    if (yontem === 'POST' && alt === 'bitir' && id) {
      if (!k.yazabilir) return izinYok();
      const a = k.atamalar.find((x) => x.id === id);
      if (!a) return bulunamadi();
      a.bitis_tarihi = tarih(simdi());
      return { durum: 200, govde: a };
    }
    return bulunamadi();
  }

  // --- davetler ---
  if (kaynak === 'davetler') {
    if (!id && yontem === 'GET') {
      const durum = sorgu.get('durum');
      const grupId = sorgu.get('grup_id');
      const liste = k.davetler.filter(
        (d) => (!durum || d.durum === durum) && (!grupId || d.grup_id === grupId),
      );
      const { dilim, sonraki } = sayfala(liste, sorgu);
      return { durum: 200, govde: { davetler: dilim, kapsam: 'kurum', sonraki_imlec: sonraki } };
    }
    if (!id && yontem === 'POST') {
      const sonuc = davetOlustur(k, g);
      if ('durum' in sonuc && typeof sonuc.durum === 'number') return sonuc;
      const olusan = sonuc as { davet: Davet; belirtec: string };
      return {
        durum: 201,
        govde: {
          davet: olusan.davet,
          belirtec: olusan.belirtec,
          gonderim: olusan.davet.kanal === 'baglanti' ? 'yok' : 'gonderildi',
        },
      };
    }
    if (id === 'toplu' && yontem === 'POST') {
      const satirlar = Array.isArray(g.davetler) ? (g.davetler as Kayit[]) : [];
      if (satirlar.length === 0 || satirlar.length > 100) return dogrulama();
      const sonuclar = satirlar.map((satir, sira) => {
        const s = davetOlustur(k, satir);
        if ('durum' in s && typeof s.durum === 'number') {
          const e = (s.govde as { error: { code: string; message: string } }).error;
          return {
            sira,
            durum: 'hata',
            davet: null,
            belirtec: null,
            gonderim: null,
            hata_kodu: e.code,
            hata_mesaji: e.message,
          };
        }
        const o = s as { davet: Davet; belirtec: string };
        return {
          sira,
          durum: 'basarili',
          davet: o.davet,
          belirtec: o.belirtec,
          gonderim: o.davet.kanal === 'baglanti' ? 'yok' : 'gonderildi',
          hata_kodu: null,
          hata_mesaji: null,
        };
      });
      const basarili = sonuclar.filter((x) => x.durum === 'basarili').length;
      return {
        durum: 200,
        govde: { sonuclar, basarili_sayisi: basarili, hata_sayisi: sonuclar.length - basarili },
      };
    }
    const davet = k.davetler.find((d) => d.id === id);
    if (davet && yontem === 'POST' && alt === 'iptal') {
      if (davet.durum !== 'bekliyor') {
        return hata(409, 'davet_beklemiyor', 'Davet artık bekleyen durumda değil.');
      }
      davet.durum = 'iptal';
      return { durum: 200, govde: davet };
    }
    if (davet && yontem === 'POST' && alt === 'yeniden-gonder') {
      if (davet.durum !== 'bekliyor' || davet.kanal === 'baglanti') {
        return hata(422, 'yeniden_gonderilemez', 'Bu davet yeniden gönderilemez.');
      }
      if ((davet.gonderim_sayisi as number) >= 3) {
        return hata(429, 'gonderim_siniri_asildi', 'Gönderim sınırına ulaşıldı.');
      }
      davet.gonderim_sayisi = (davet.gonderim_sayisi as number) + 1;
      davet.son_gonderim_at = simdi();
      return {
        durum: 200,
        govde: {
          davet,
          belirtec: rastgele(43, 'abcdefghijklmnopqrstuvwxyz0123456789'),
          gonderim: 'gonderildi',
        },
      };
    }
    return bulunamadi();
  }

  if (kaynak !== 'gruplar') return bulunamadi();

  // --- gruplar ---
  if (!id) {
    if (yontem === 'GET') {
      const durum = sorgu.get('durum') ?? 'aktif';
      const tur = sorgu.get('tur');
      const liste = k.gruplar
        .filter((x) => (durum === 'hepsi' || x.durum === durum) && (!tur || x.tur === tur))
        .map((x) => grupSatiri(k, x));
      const { dilim, sonraki } = sayfala(liste, sorgu);
      return { durum: 200, govde: { gruplar: dilim, kapsam: 'kurum', sonraki_imlec: sonraki } };
    }
    if (yontem === 'POST') {
      if (!k.yazabilir) return izinYok();
      const ad = typeof g.ad === 'string' ? g.ad.trim() : '';
      if (!ad || typeof g.tur !== 'string') return dogrulama();
      const yeni = grupYap(g.tur, ad, {
        kapasite: typeof g.kapasite === 'number' ? g.kapasite : g.tur === 'birebir' ? 1 : null,
        renk: typeof g.renk === 'string' ? g.renk : null,
        created_at: simdi(),
      });
      k.gruplar.unshift(yeni);
      k.grupUyeleri[yeni.id] = [];
      return { durum: 201, govde: grupSatiri(k, yeni) };
    }
    return bulunamadi();
  }

  const grup = k.gruplar.find((x) => x.id === id);
  if (!grup) return bulunamadi();

  if (!alt) {
    if (yontem === 'GET') return { durum: 200, govde: grupSatiri(k, grup) };
    if (yontem === 'PATCH') {
      if (!k.yazabilir) return izinYok();
      if (Object.keys(g).length === 0) return dogrulama();
      for (const alan of ['ad', 'kapasite', 'renk'] as const) {
        if (alan in g) grup[alan] = g[alan] as never;
      }
      grup.surum += 1;
      return { durum: 200, govde: grupSatiri(k, grup) };
    }
    return bulunamadi();
  }

  if (alt === 'arsivle' && yontem === 'POST') {
    if (!k.yazabilir) return izinYok();
    grup.durum = 'arsiv';
    grup.arsivlendi_at = simdi();
    return { durum: 200, govde: grupSatiri(k, grup) };
  }

  if (alt === 'uyeler') {
    const liste = (k.grupUyeleri[grup.id] ??= []);
    if (yontem === 'GET' && !altId) {
      return { durum: 200, govde: { uyeler: liste.filter((u) => u.bitis_tarihi === null) } };
    }
    if (!k.yazabilir) return izinYok();
    if (yontem === 'POST' && !altId) {
      if (grup.durum === 'arsiv') return hata(409, 'grup_arsivde', 'Grup arşivde.');
      const idler = Array.isArray(g.ogrenci_idleri) ? (g.ogrenci_idleri as string[]) : [];
      if (idler.length === 0) return dogrulama();
      const etkin = liste.filter((u) => u.bitis_tarihi === null);
      const zaten = idler.filter((x) => etkin.some((u) => u.ogrenci_id === x));
      const yeniler = idler.filter((x) => !zaten.includes(x));
      if (grup.kapasite !== null && etkin.length + yeniler.length > grup.kapasite) {
        return hata(409, 'kapasite_dolu', 'Grup kapasitesi dolu.');
      }
      const eklenenler = yeniler.map((ogrId) => ({
        id: uid(),
        grup_id: grup.id,
        ogrenci_id: ogrId,
        gorunen_ad: k.uyeler.find((u) => u.uyelik_id === ogrId)?.gorunen_ad ?? null,
        baslangic_tarihi: tarih(simdi()),
        bitis_tarihi: null,
        katilim_yolu: 'yonetici',
      }));
      liste.push(...eklenenler);
      return { durum: 201, govde: { eklenenler, zaten_uye: zaten } };
    }
    if (yontem === 'DELETE' && altId) {
      const u = liste.find((x) => x.ogrenci_id === altId && x.bitis_tarihi === null);
      if (!u) return bulunamadi();
      u.bitis_tarihi = tarih(simdi());
      return { durum: 200, govde: u };
    }
    return bulunamadi();
  }

  if (alt === 'atamalar') {
    if (yontem === 'GET') {
      return {
        durum: 200,
        govde: {
          atamalar: k.atamalar.filter((a) => a.grup_id === grup.id && a.bitis_tarihi === null),
        },
      };
    }
    if (yontem === 'POST') {
      if (!k.yazabilir) return izinYok();
      const ogretmen = k.uyeler.find((u) => u.uyelik_id === g.ogretmen_id && u.rol === 'ogretmen');
      if (!ogretmen || typeof g.brans_kodu !== 'string') return dogrulama();
      if (
        k.atamalar.some(
          (a) =>
            a.grup_id === grup.id &&
            a.bitis_tarihi === null &&
            a.ogretmen_id === ogretmen.uyelik_id &&
            a.brans_kodu === g.brans_kodu,
        )
      ) {
        return hata(409, 'atama_cakisiyor', 'Bu öğretmen bu branşta zaten atanmış.');
      }
      const yeni = {
        id: uid(),
        grup_id: grup.id,
        ogretmen_id: ogretmen.uyelik_id,
        ogretmen_ad: ogretmen.gorunen_ad,
        brans_kodu: g.brans_kodu,
        baslangic_tarihi: tarih(simdi()),
        bitis_tarihi: null,
        ana_ogretmen: g.ana_ogretmen === true,
      };
      k.atamalar.push(yeni);
      return { durum: 201, govde: yeni };
    }
    return bulunamadi();
  }

  if (alt === 'katilim-kodu') {
    if (grup.tur !== 'sinif') {
      return hata(422, 'grup_sinif_degil', 'Katılım kodu yalnız sınıf türündeki gruplarda olur.');
    }
    const mevcut = k.kodlar[grup.id] ?? null;
    if (yontem === 'GET') {
      return mevcut?.aktif ? { durum: 200, govde: mevcut } : bulunamadi();
    }
    if (grup.durum === 'arsiv') return hata(409, 'grup_arsivde', 'Grup arşivde.');
    if (yontem === 'POST') {
      const yeni = {
        id: uid(),
        grup_id: grup.id,
        kod: rastgele(8),
        aktif: true,
        expires_at: typeof g.gecerlilik_gun === 'number' ? gunSonra(g.gecerlilik_gun) : null,
        max_kullanim: typeof g.max_kullanim === 'number' ? g.max_kullanim : null,
        kullanim_sayisi: 0,
        iptal_at: null,
        created_at: simdi(),
      };
      k.kodlar[grup.id] = yeni;
      return { durum: 201, govde: yeni };
    }
    if (yontem === 'DELETE') {
      if (mevcut) {
        mevcut.aktif = false;
        mevcut.iptal_at = simdi();
      }
      return { durum: 200, govde: mevcut ?? { kapatildi: true } };
    }
    return bulunamadi();
  }

  if (alt === 'katilim-istekleri') {
    const liste = (k.istekler[grup.id] ??= []);
    if (yontem === 'GET' && !altId) {
      const durum = sorgu.get('durum');
      const suzulen = liste.filter((i) => !durum || i.durum === durum);
      const { dilim, sonraki } = sayfala(suzulen, sorgu);
      return { durum: 200, govde: { istekler: dilim, sonraki_imlec: sonraki } };
    }
    const istek = liste.find((i) => i.id === altId);
    if (!istek) return bulunamadi();
    if (yontem === 'POST' && (eylem === 'onayla' || eylem === 'reddet')) {
      if (istek.durum !== 'bekliyor') {
        if (eylem === 'onayla' && istek.durum === 'onaylandi') {
          return { durum: 200, govde: { istek, uyelik_id: null, grup_uyesi_id: null } };
        }
        return hata(409, 'istek_beklemiyor', 'Bu istek artık bekleyen durumda değil.');
      }
      if (eylem === 'reddet') {
        istek.durum = 'reddedildi';
        istek.karar_at = simdi();
        return { durum: 200, govde: { istek, uyelik_id: null, grup_uyesi_id: null } };
      }
      const etkin = (k.grupUyeleri[grup.id] ?? []).filter((u) => u.bitis_tarihi === null);
      if (grup.kapasite !== null && etkin.length >= grup.kapasite) {
        return hata(409, 'kapasite_dolu', 'Grup kapasitesi dolu.');
      }
      istek.durum = 'onaylandi';
      istek.karar_at = simdi();
      const uyelikId = uid();
      k.uyeler.push({
        uyelik_id: uyelikId,
        kullanici_id: istek.kullanici_id,
        rol: 'ogrenci',
        durum: 'aktif',
        gorunen_ad: (istek.gorunen_ad as string | null) ?? 'Yeni öğrenci',
        sube_id: null,
        kademe_id: null,
        katildi_at: simdi(),
      });
      const grupUyesi = {
        id: uid(),
        grup_id: grup.id,
        ogrenci_id: uyelikId,
        gorunen_ad: istek.gorunen_ad,
        baslangic_tarihi: tarih(simdi()),
        bitis_tarihi: null,
        katilim_yolu: 'sinif_kodu',
      };
      (k.grupUyeleri[grup.id] ??= []).push(grupUyesi);
      return { durum: 200, govde: { istek, uyelik_id: uyelikId, grup_uyesi_id: grupUyesi.id } };
    }
    return bulunamadi();
  }

  return bulunamadi();
}

/** Kiracisiz uc noktalar: oturumlar, davet kabulu, sinif kodu ile katilim. */
function kiracisiz(parcalar: string[], istek: Istek): Yanit {
  const d = depo();
  const { yontem } = istek;
  const g = govdeNesnesi(istek.govde);

  if (parcalar[0] === 'oturumlar') {
    if (yontem === 'GET' && parcalar.length === 1) {
      // Tum oturumlar kapatildiktan sonra yeni giris yeni oturum demektir.
      if (d.oturumlar.length === 0) d.oturumlar = oturumlariKur();
      return { durum: 200, govde: { oturumlar: d.oturumlar } };
    }
    if (yontem === 'POST' && parcalar[1] === 'tumunu-kapat') {
      const haric = g.mevcut_haric === true;
      const once = d.oturumlar.length;
      d.oturumlar = haric ? d.oturumlar.filter((o) => o.bu_oturum === true) : [];
      return { durum: 200, govde: { kapatilan: once - d.oturumlar.length } };
    }
    if (yontem === 'DELETE' && parcalar[1]) {
      const sira = d.oturumlar.findIndex((o) => o.id === parcalar[1]);
      if (sira < 0) return bulunamadi();
      d.oturumlar.splice(sira, 1);
      return { durum: 200, govde: { sonlandirildi: true } };
    }
    return bulunamadi();
  }

  if (parcalar[0] === 'davetler' && parcalar[1] === 'kabul' && yontem === 'POST') {
    const belirtec = typeof g.belirtec === 'string' ? g.belirtec.trim() : '';
    if (belirtec.length < 20) return dogrulama();
    if (belirtec.startsWith('gecersiz')) {
      return hata(410, 'davet_gecersiz', 'Davet geçersiz, süresi dolmuş ya da kullanılmış.');
    }
    if (belirtec.startsWith('zatenuye')) return hata(409, 'zaten_uye', 'Bu kurumda zaten üyesin.');
    const grupId = uid();
    return {
      durum: 200,
      govde: {
        davet_id: uid(),
        kurum_id: 'kurum-ege',
        uyelik_id: 'uyelik-ege-ogretmen',
        rol: 'ogretmen',
        grup_id: grupId,
        grup_uyesi_id: null,
      },
    };
  }

  if (parcalar[0] === 'sinif-kodu') {
    if (parcalar[1] === 'katil' && yontem === 'POST') {
      const kod = kodNormalle(typeof g.kod === 'string' ? g.kod : '');
      if (kod === 'MMMM2222') {
        return hata(
          429,
          'cok_fazla_istek',
          'Çok fazla hatalı deneme. 15 dakika sonra tekrar dene.',
        );
      }
      if (kod === 'ZATEN222') return hata(409, 'zaten_uye', 'Bu kurumda zaten üyesin.');
      for (const [kurumId, k] of Object.entries(tumKurumlar())) {
        for (const grup of k.gruplar) {
          const satir = k.kodlar[grup.id];
          if (!satir?.aktif || satir.kod !== kod || grup.durum !== 'aktif') continue;
          const liste = (k.istekler[grup.id] ??= []);
          const mevcutIstek = liste.find(
            (i) => i.kullanici_id === MOCK_KULLANICI_ID && i.durum === 'bekliyor',
          );
          if (mevcutIstek) return { durum: 200, govde: ownGorunum(kurumId, k, mevcutIstek) };
          const yeni = {
            id: uid(),
            grup_id: grup.id,
            kullanici_id: MOCK_KULLANICI_ID,
            gorunen_ad: 'Elif Yılmaz',
            durum: 'bekliyor',
            karar_veren_id: null,
            karar_at: null,
            created_at: simdi(),
          };
          liste.unshift(yeni);
          return { durum: 201, govde: ownGorunum(kurumId, k, yeni) };
        }
      }
      return hata(410, 'kod_gecersiz', 'Kod geçersiz ya da süresi dolmuş.');
    }
    if (parcalar[1] === 'istekler') {
      if (yontem === 'GET' && parcalar.length === 2) {
        const durum = istek.sorgu.get('durum') ?? 'bekliyor';
        const liste = istekleriBul(tumDepo(), MOCK_KULLANICI_ID).filter((i) => i.durum === durum);
        return { durum: 200, govde: { istekler: liste } };
      }
      if (yontem === 'POST' && parcalar[3] === 'iptal') {
        for (const k of Object.values(tumDepo().kurumlar)) {
          for (const liste of Object.values(k.istekler)) {
            const i = liste.find(
              (x) => x.id === parcalar[2] && x.kullanici_id === MOCK_KULLANICI_ID,
            );
            if (!i) continue;
            if (i.durum === 'iptal') return { durum: 200, govde: { id: i.id, durum: 'iptal' } };
            if (i.durum !== 'bekliyor')
              return hata(409, 'istek_beklemiyor', 'Bu istek karara bağlanmış.');
            i.durum = 'iptal';
            return { durum: 200, govde: { id: i.id, durum: 'iptal' } };
          }
        }
        return bulunamadi();
      }
    }
  }
  return bulunamadi();
}

/** Sinif kodu aramasi tum deneme kurumlarini kapsar (henuz acilmamis olanlar dahil). */
function tumKurumlar(): Record<string, KurumDurumu> {
  for (const kurumId of Object.keys(KURUM_ADLARI)) kurum(kurumId);
  return depo().kurumlar;
}
function tumDepo(): Depo {
  tumKurumlar();
  return depo();
}

function ownGorunum(kurumId: string, k: KurumDurumu, i: Kayit): Kayit {
  const grup = k.gruplar.find((x) => x.id === i.grup_id);
  return {
    id: i.id,
    kurum_id: kurumId,
    kurum_ad: KURUM_ADLARI[kurumId] ?? null,
    grup_id: i.grup_id,
    grup_ad: grup?.ad ?? null,
    durum: i.durum,
    karar_at: i.karar_at,
    created_at: i.created_at,
  };
}

export function hesapMock(istek: Istek): Yanit {
  const parcalar = istek.yol.split('/');
  if (parcalar[0] === 'kurumlar' && parcalar[1]) {
    if (!(parcalar[1] in KURUM_ADLARI)) return bulunamadi();
    return kurumdaIsle(parcalar[1], parcalar.slice(2), istek);
  }
  return kiracisiz(parcalar, istek);
}
