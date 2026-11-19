import { duyuruMock, duyuruMockSifirla, mockDuyuruKimligi } from './duyuru-mock';
import { mockSimdi } from './mock-zaman';
import type { MockIstek, MockYanit } from './vekil';

/**
 * `NEXT_PUBLIC_API_MOCK=1` iken `/api/bildirim/*` ucunun bellek ici karsiligi: kurum basina gelen kutusu
 * (imleçli liste, okunmamis sayisi, okundu, arsivle, tumunu oku), tercih matrisi ve ayarlar. Yanit sekilleri
 * `@kopru/contracts` bildirim semalariyla aynidir; kilitli tercih `400 tercih_kilitli`, esit sessiz saat
 * `400` verir (gercek servisle ayni). Ogrenci: `kurum-atlas`; ogretmen: `kurum-ege`; digerleri kisa genel liste.
 * Veri sunucu sureci yeniden baslayana kadar bellekte kalir (yalniz gelistirme ve e2e).
 */

const KATEGORILER = [
  'ders',
  'yoklama',
  'odev',
  'soru',
  'kayit',
  'duyuru',
  'finans',
  'oyunlastirma',
  'abonelik',
  'sistem',
] as const;
type Kategori = (typeof KATEGORILER)[number];
const KANALLAR = ['kutu', 'push', 'eposta', 'sms'] as const;
type Kanal = (typeof KANALLAR)[number];

const kilitliMi = (kategori: string, kanal: string) => kategori === 'sistem' || kanal === 'kutu';
const varsayilanAcik = (kategori: Kategori, kanal: Kanal) =>
  kategori === 'sistem' ||
  kanal === 'kutu' ||
  kanal === 'push' ||
  (kanal === 'eposta' && kategori === 'abonelik');

const VARSAYILAN_AYARLAR = {
  sessiz_baslangic: '22:00',
  sessiz_bitis: '08:00',
  sessiz_gunler: [1, 2, 3, 4, 5, 6, 7],
  saat_dilimi: 'Europe/Istanbul',
  ders_hatirlatma_dk: 60,
};
type Ayarlar = typeof VARSAYILAN_AYARLAR;
const HATIRLATMALAR = [0, 15, 30, 60, 120, 1440];
const SAAT = /^([01]\d|2[0-3]):[0-5]\d$/;

interface MockOge {
  id: string;
  kategori: Kategori;
  sablon_kodu: string;
  baslik: string;
  govde: string;
  derin_baglanti: string | null;
  veri: Record<string, unknown>;
  okundu_at: string | null;
  arsivlendi_at: string | null;
  gecerlilik_bitis_at: string | null;
  created_at: string;
}

interface KurumDeposu {
  ogeler: MockOge[];
  tercihler: Map<string, boolean>;
  ayarlar: Ayarlar;
}

const DK = 60_000;
const SA = 3_600_000;
const GUN = 86_400_000;
const uid = () => crypto.randomUUID();
const ok = (govde: unknown, durum = 200): MockYanit => ({ durum, govde });
const hata = (durum: number, kod: string, mesaj: string, details?: unknown): MockYanit => ({
  durum,
  govde: { error: { code: kod, message: mesaj, ...(details === undefined ? {} : { details }) } },
});

function oge(
  simdi: number,
  once: number,
  okundu: boolean,
  kategori: Kategori,
  sablon: string,
  baslik: string,
  govde: string,
  derin: string | null,
): MockOge {
  const olusma = new Date(simdi - once).toISOString();
  return {
    id: uid(),
    kategori,
    sablon_kodu: sablon,
    baslik,
    govde,
    derin_baglanti: derin,
    veri: {},
    okundu_at: okundu ? new Date(simdi - once + 5 * DK).toISOString() : null,
    arsivlendi_at: null,
    gecerlilik_bitis_at: null,
    created_at: olusma,
  };
}

function tohumla(kurumId: string): MockOge[] {
  const n = mockSimdi();
  if (kurumId === 'kurum-atlas') {
    const baslangic = [
      oge(
        n,
        2 * DK,
        false,
        'soru',
        'soru_cevaplandi',
        'Sorun cevaplandı',
        'Sorduğun soruya cevap geldi. Açıp bakabilirsin.',
        `kopru://soru/${uid()}`,
      ),
      oge(
        n,
        50 * DK,
        false,
        'odev',
        'odev_yeni',
        'Yeni ödev',
        'Öğretmenin sana yeni bir ödev verdi.',
        `kopru://odev/${uid()}`,
      ),
      oge(
        n,
        5 * SA,
        false,
        'oyunlastirma',
        'seri_hatirlatma',
        'Serini koru!',
        '5 günlük serin bugün bitebilir. Küçük bir görevle devam ettir.',
        'kopru://bugun',
      ),
      oge(
        n,
        8 * SA,
        true,
        'ders',
        'ders_hatirlatma',
        'Dersin yaklaşıyor',
        'Matematik dersin bir saat sonra başlıyor.',
        `kopru://ders/${uid()}`,
      ),
      oge(
        n,
        26 * SA,
        true,
        'kayit',
        'kayit_eklendi',
        'Ders kaydı eklendi',
        'Matematik dersinin kaydı eklendi.',
        `kopru://kayit/${uid()}`,
      ),
      oge(
        n,
        30 * SA,
        true,
        'duyuru',
        'duyuru_yeni',
        'Yeni duyuru',
        'Kurumdan yeni bir duyuru var.',
        `kopru://duyuru/${mockDuyuruKimligi(1)}`,
      ),
      oge(
        n,
        3 * GUN,
        true,
        'oyunlastirma',
        'rozet_kazanildi',
        'Yeni rozet',
        'Bir rozet kazandın. Karakter ekranında görebilirsin.',
        'kopru://rozet',
      ),
      oge(
        n,
        4 * GUN,
        true,
        'sistem',
        'davet_kabul',
        'Kuruma hoş geldin',
        'Hesabın kuruma bağlandı.',
        'kopru://bilinmeyen/ornek',
      ),
    ];
    // Sayfalamayi denemek icin daha eski, okunmus bildirimler (toplam 26).
    const eski = Array.from({ length: 18 }, (_, i) =>
      oge(
        n,
        (5 + i) * GUN,
        true,
        'oyunlastirma',
        'seri_hatirlatma',
        'Serini koru!',
        '5 günlük serin bugün bitebilir. Küçük bir görevle devam ettir.',
        'kopru://bugun',
      ),
    );
    return [...baslangic, ...eski];
  }
  if (kurumId === 'kurum-ege') {
    return [
      oge(
        n,
        4 * DK,
        false,
        'soru',
        'yeni_soru',
        'Yeni soru geldi',
        'Bir öğrencin soru sordu. Cevaplamak için aç.',
        `kopru://soru/${uid()}`,
      ),
      oge(
        n,
        40 * DK,
        false,
        'yoklama',
        'yoklama_bekliyor',
        'Yoklama bekliyor',
        'Biten dersin yoklaması henüz alınmadı.',
        `kopru://yoklama/${uid()}`,
      ),
      oge(
        n,
        3 * SA,
        false,
        'odev',
        'odev_teslim',
        'Ödev teslim edildi',
        'Bir öğrencin ödevini teslim etti.',
        `kopru://odev/${uid()}`,
      ),
      oge(
        n,
        20 * SA,
        true,
        'finans',
        'finans_kredi_dusuk',
        'Düşük ders kredisi',
        'Bir öğrencinin ders kredisi azaldı.',
        `kopru://finans/ogrenci/${uid()}`,
      ),
      oge(
        n,
        2 * GUN,
        true,
        'duyuru',
        'duyuru_yeni',
        'Yeni duyuru',
        'Kurumdan yeni bir duyuru var.',
        `kopru://duyuru/${mockDuyuruKimligi(1)}`,
      ),
    ];
  }
  return [
    oge(
      n,
      10 * DK,
      false,
      'sistem',
      'sistem_bilgi',
      'Hoş geldin',
      'Bildirimlerin burada birikir.',
      null,
    ),
    oge(
      n,
      2 * GUN,
      true,
      'duyuru',
      'duyuru_yeni',
      'Yeni duyuru',
      'Kurumdan yeni bir duyuru var.',
      `kopru://duyuru/${mockDuyuruKimligi(1)}`,
    ),
  ];
}

// Next ayni modulu birden cok paketleyicide yukleyebilir; durum globalThis'te tutulur (motivasyon mock'u gibi).
const genel = globalThis as { __kopruBildirimMock?: Map<string, KurumDeposu> };
const depolar = (genel.__kopruBildirimMock ??= new Map<string, KurumDeposu>());

/** Testler icin: tum kurum durumunu tohum verisine dondurur. */
export function bildirimMockSifirla(): void {
  depolar.clear();
  duyuruMockSifirla();
}

function depo(kurumId: string): KurumDeposu {
  let d = depolar.get(kurumId);
  if (!d) {
    d = { ogeler: tohumla(kurumId), tercihler: new Map(), ayarlar: { ...VARSAYILAN_AYARLAR } };
    depolar.set(kurumId, d);
  }
  return d;
}

const gorunen = (d: KurumDeposu) =>
  d.ogeler
    .filter((o) => o.arsivlendi_at === null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

const acikMi = (d: KurumDeposu, kategori: Kategori, kanal: Kanal) =>
  kilitliMi(kategori, kanal)
    ? varsayilanAcik(kategori, kanal)
    : (d.tercihler.get(`${kategori}|${kanal}`) ?? varsayilanAcik(kategori, kanal));

const matris = (d: KurumDeposu) =>
  KATEGORILER.flatMap((kategori) =>
    KANALLAR.map((kanal) => ({
      kategori,
      kanal,
      acik: acikMi(d, kategori, kanal),
      kilitli: kilitliMi(kategori, kanal),
    })),
  );

function nesne(govde: unknown): Record<string, unknown> {
  return typeof govde === 'object' && govde !== null ? (govde as Record<string, unknown>) : {};
}

const bulunamadi = () => hata(404, 'bulunamadi', 'Bildirim bulunamadı.');

export function bildirimMock(istek: MockIstek): MockYanit {
  const parcalar = istek.yol.split('/');
  if (parcalar[0] === 'cihazlar') {
    return istek.yontem === 'PUT'
      ? ok({ cihaz_kimligi: 'mock', aktif: true })
      : ok({ cihaz_kimligi: parcalar.at(-1) ?? 'mock', aktif: false });
  }
  if (parcalar[0] !== 'kurumlar' || !parcalar[1]) return bulunamadi();
  const d = depo(parcalar[1]);
  const [, , alan, a, b] = parcalar;

  if (alan === 'duyurular') return duyuruMock(parcalar[1], parcalar, istek);

  if (alan === 'kutu') {
    if (a === undefined && istek.yontem === 'GET') {
      let liste = gorunen(d);
      if (istek.sorgu.get('okunmamis') === 'true')
        liste = liste.filter((o) => o.okundu_at === null);
      const limit = Math.min(50, Math.max(1, Number(istek.sorgu.get('limit') ?? 20) || 20));
      const bas = Math.max(0, Number(istek.sorgu.get('imlec') ?? 0) || 0);
      const dilim = liste.slice(bas, bas + limit);
      const ogeler = dilim.map(({ arsivlendi_at: _a, ...o }) => o);
      return ok({
        ogeler,
        sonraki_imlec: bas + limit < liste.length ? String(bas + limit) : null,
      });
    }
    if (a === 'okunmamis-sayisi') {
      return ok({ okunmamis: gorunen(d).filter((o) => o.okundu_at === null).length });
    }
    if (a === 'tumunu-oku' && istek.yontem === 'POST') {
      const simdi = new Date(mockSimdi()).toISOString();
      let n = 0;
      for (const o of d.ogeler) {
        if (o.okundu_at === null) {
          o.okundu_at = simdi;
          n += 1;
        }
      }
      return ok({ guncellenen: n });
    }
    if (a && (b === 'okundu' || b === 'arsivle') && istek.yontem === 'POST') {
      const o = d.ogeler.find((x) => x.id === a);
      if (!o) return bulunamadi();
      const simdi = new Date(mockSimdi()).toISOString();
      o.okundu_at ??= simdi;
      if (b === 'arsivle') o.arsivlendi_at ??= simdi;
      return ok({ id: o.id, okundu_at: o.okundu_at, arsivlendi_at: o.arsivlendi_at });
    }
    return bulunamadi();
  }

  if (alan === 'tercihler') {
    if (istek.yontem === 'PUT') {
      const liste = nesne(istek.govde).tercihler;
      if (!Array.isArray(liste) || liste.length === 0) {
        return hata(400, 'dogrulama_hatasi', 'Geçersiz istek.');
      }
      const kilitli = liste
        .map(nesne)
        .filter((t) => kilitliMi(String(t.kategori), String(t.kanal)))
        .map((t) => ({ kategori: t.kategori, kanal: t.kanal }));
      if (kilitli.length > 0) {
        return hata(
          400,
          'tercih_kilitli',
          'Sistem bildirimleri ve gelen kutusu kapatılamaz.',
          kilitli,
        );
      }
      for (const t of liste.map(nesne)) {
        d.tercihler.set(`${String(t.kategori)}|${String(t.kanal)}`, t.acik === true);
      }
    }
    return ok({ tercihler: matris(d) });
  }

  if (alan === 'ayarlar') {
    if (istek.yontem === 'PUT') {
      const g = nesne(istek.govde);
      const bas = g.sessiz_baslangic;
      const bit = g.sessiz_bitis;
      if ((bas === undefined) !== (bit === undefined)) {
        return hata(400, 'dogrulama_hatasi', 'sessiz_baslangic ve sessiz_bitis birlikte verilmeli');
      }
      if (
        bas !== undefined &&
        !(typeof bas === 'string' && SAAT.test(bas) && typeof bit === 'string' && SAAT.test(bit))
      ) {
        return hata(400, 'dogrulama_hatasi', 'Saat HH:MM biçiminde olmalı.');
      }
      if (bas !== undefined && bas === bit) {
        return hata(400, 'dogrulama_hatasi', 'Sessiz saat başlangıcı ve bitişi aynı olamaz.');
      }
      if (
        g.ders_hatirlatma_dk !== undefined &&
        !HATIRLATMALAR.includes(Number(g.ders_hatirlatma_dk))
      ) {
        return hata(400, 'dogrulama_hatasi', 'Geçersiz hatırlatma süresi.');
      }
      if (g.sessiz_gunler !== undefined && !Array.isArray(g.sessiz_gunler)) {
        return hata(400, 'dogrulama_hatasi', 'Geçersiz günler.');
      }
      d.ayarlar = {
        ...d.ayarlar,
        ...(typeof bas === 'string' ? { sessiz_baslangic: bas } : {}),
        ...(typeof bit === 'string' ? { sessiz_bitis: bit } : {}),
        ...(Array.isArray(g.sessiz_gunler)
          ? { sessiz_gunler: [...new Set(g.sessiz_gunler.map(Number))].sort((x, y) => x - y) }
          : {}),
        ...(g.ders_hatirlatma_dk !== undefined
          ? { ders_hatirlatma_dk: Number(g.ders_hatirlatma_dk) }
          : {}),
      };
    }
    return ok(d.ayarlar);
  }
  return bulunamadi();
}
