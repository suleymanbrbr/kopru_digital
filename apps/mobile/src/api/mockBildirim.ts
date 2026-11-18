import { BILDIRIM_KATEGORILERI } from '@kopru/contracts';

import type {
  BildirimAdapter,
  BildirimAyarlari,
  BildirimKutuOgesi,
  BildirimTercihi,
} from './bildirimTipleri';
import { mockDuyuru } from './mockDuyuru';
import type { MockOperasyonSecenekleri } from './mockOperasyon';
import { ApiHata } from './tipler';

const DAKIKA = 60_000;
const SAAT = 60 * DAKIKA;

/** Kilitli hucreler sunucudaki gibi: `sistem` kategorisi ve `kutu` kanali degistirilemez. */
const VARSAYILAN_PUSH: Record<string, boolean> = {
  ders: true,
  yoklama: true,
  odev: true,
  soru: true,
  kayit: true,
  duyuru: true,
  finans: true,
  oyunlastirma: true,
  abonelik: true,
  sistem: true,
};

export interface MockBildirim {
  adaptor: BildirimAdapter;
  /** Test/gelistirme: kutuya yeni bildirim ekler (en uste). */
  ekle: (o: Partial<BildirimKutuOgesi> & Pick<BildirimKutuOgesi, 'baslik' | 'govde'>) => string;
  /** Kayitli cihazlar (test icin). */
  cihazlar: () => string[];
}

/** Mock bildirim: yalniz bellek ici; kutu tohum verisi tum derin baglanti turlerini kapsar. */
export function mockBildirim(sec: MockOperasyonSecenekleri): MockBildirim {
  const simdi = () => sec.simdi?.() ?? Date.now();
  const gecik = async () => {
    await sec.bekle(sec.gecikmeMs / 2);
    await sec.oturumGerekli();
  };

  let sayac = 0;
  const yeniId = () => `0190f3a0-0000-7000-8000-${String(100 + ++sayac).padStart(12, '0')}`;
  const iso = (ms: number) => new Date(ms).toISOString();

  const tohum = (
    kategori: BildirimKutuOgesi['kategori'],
    baslik: string,
    govde: string,
    derin: string | null,
    kacDkOnce: number,
    okundu = false,
  ): BildirimKutuOgesi => ({
    id: yeniId(),
    kategori,
    sablon_kodu: `mock_${kategori}`,
    baslik,
    govde,
    derin_baglanti: derin,
    veri: {},
    okundu_at: okundu ? iso(simdi() - (kacDkOnce - 1) * DAKIKA) : null,
    gecerlilik_bitis_at: null,
    created_at: iso(simdi() - kacDkOnce * DAKIKA),
  });

  const ogeler: BildirimKutuOgesi[] = [
    tohum(
      'soru',
      'Sorun cevaplandı',
      'Sorduğun soruya cevap geldi. Açıp bakabilirsin.',
      'kopru://soru/0190f3a0-0000-7000-8000-0000000000a1',
      5,
    ),
    tohum(
      'odev',
      'Yeni ödev',
      'Matematik dersinden yeni bir ödevin var.',
      'kopru://odev/0190f3a0-0000-7000-8000-0000000000a2',
      40,
    ),
    tohum('ders', 'Ders hatırlatma', 'Dersin 1 saat sonra başlıyor.', 'kopru://dersler', 3 * 60),
    tohum(
      'kayit',
      'Ders kaydı eklendi',
      'Matematik dersinin kaydı eklendi.',
      'kopru://kayitlarim',
      26 * 60,
      true,
    ),
    tohum(
      'oyunlastirma',
      'Serini koru',
      'Bugünkü hedefin seni bekliyor. Küçük bir adım yeter.',
      'kopru://karakter',
      2 * 24 * 60,
      true,
    ),
    tohum('duyuru', 'Kurumdan duyuru', 'Hafta sonu dersleri yapılacak.', null, 3 * 24 * 60, true),
  ];
  const arsiv = new Set<string>();
  const cihazlar = new Map<string, string>();

  let tercihler = new Map<string, boolean>(Object.entries(VARSAYILAN_PUSH));
  let ayarlar: BildirimAyarlari = {
    sessiz_baslangic: '22:00',
    sessiz_bitis: '08:00',
    sessiz_gunler: [1, 2, 3, 4, 5, 6, 7],
    saat_dilimi: 'Europe/Istanbul',
    ders_hatirlatma_dk: 60,
  };

  const gorunen = () =>
    ogeler
      .filter((o) => !arsiv.has(o.id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));

  const matris = (): BildirimTercihi[] =>
    BILDIRIM_KATEGORILERI.flatMap((kategori) => [
      { kategori, kanal: 'kutu' as const, acik: true, kilitli: true },
      {
        kategori,
        kanal: 'push' as const,
        acik: kategori === 'sistem' ? true : (tercihler.get(kategori) ?? true),
        kilitli: kategori === 'sistem',
      },
    ]);

  const adaptor: BildirimAdapter = {
    ...mockDuyuru(sec),
    async cihazKaydet(k) {
      await gecik();
      cihazlar.set(k.cihaz_kimligi, k.push_belirteci);
    },
    async cihazSil(kimlik) {
      await gecik();
      cihazlar.delete(kimlik);
    },
    async kutu(s) {
      await gecik();
      const limit = s?.limit ?? 20;
      const liste = gorunen().filter((o) => !s?.okunmamis || o.okundu_at === null);
      const bas = s?.imlec ? Number(s.imlec) : 0;
      const sayfa = liste.slice(bas, bas + limit);
      return {
        ogeler: sayfa,
        sonrakiImlec: bas + limit < liste.length ? String(bas + limit) : null,
      };
    },
    async okunmamisSayisi() {
      await gecik();
      return gorunen().filter((o) => o.okundu_at === null).length;
    },
    async okundu(id) {
      await gecik();
      const o = ogeler.find((x) => x.id === id);
      if (!o) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      o.okundu_at ??= iso(simdi());
    },
    async tumunuOku() {
      await gecik();
      let n = 0;
      for (const o of ogeler) {
        if (o.okundu_at === null) {
          o.okundu_at = iso(simdi());
          n++;
        }
      }
      return n;
    },
    async arsivle(id) {
      await gecik();
      if (!ogeler.some((x) => x.id === id))
        throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      arsiv.add(id);
    },
    async tercihler() {
      await gecik();
      return matris();
    },
    async tercihGuncelle(g) {
      await gecik();
      const yeni = new Map(tercihler);
      for (const h of g) {
        if (h.kategori === 'sistem') {
          throw new ApiHata('dogrulama', undefined, { durum: 400, ayrinti: 'tercih_kilitli' });
        }
        yeni.set(h.kategori, h.acik);
      }
      tercihler = yeni;
      return matris();
    },
    async ayarlar() {
      await gecik();
      return ayarlar;
    },
    async ayarGuncelle(g) {
      await gecik();
      const sonraki = { ...ayarlar, ...g };
      if (sonraki.sessiz_baslangic === sonraki.sessiz_bitis) {
        throw new ApiHata('dogrulama', 'Sessiz saat başlangıcı ve bitişi aynı olamaz.', {
          durum: 400,
        });
      }
      ayarlar = sonraki;
      return ayarlar;
    },
  };

  return {
    adaptor,
    ekle: (o) => {
      const oge: BildirimKutuOgesi = {
        id: yeniId(),
        kategori: 'sistem',
        sablon_kodu: 'mock',
        derin_baglanti: null,
        veri: {},
        okundu_at: null,
        gecerlilik_bitis_at: null,
        created_at: iso(simdi() + SAAT),
        ...o,
      };
      ogeler.push(oge);
      return oge.id;
    },
    cihazlar: () => [...cihazlar.keys()],
  };
}
