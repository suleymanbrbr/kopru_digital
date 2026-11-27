import type { OperasyonBagimliligi } from './gercekOperasyon';
import type {
  AnalizZorlugu,
  Analiz,
  BantTespiti,
  GunlukKayit,
  GunlukSoruAdapter,
  Hucre,
  HucreDetayi,
  KaynakKitap,
  KaynakKitapDetayi,
  KaynakTest,
  KonuAnalizi,
  Oneri,
  SonKullanilanlar,
  Zorluk,
} from './gunlukSoruTipleri';

// --- Api govdeleri (snake_case) -------------------------------------------------------------

interface ApiKayit {
  id: string;
  ogrenci_id: string;
  gun: string;
  brans_kodu: string;
  konu_id: string;
  konu_ad: string | null;
  zorluk: Zorluk;
  kaynak_test_id: string | null;
  kaynak_kitap_id: string | null;
  kaynak_metin: string | null;
  dogru: number;
  yanlis: number;
  bos: number;
  toplam: number;
  plan_gorev_id: string | null;
  dosyalar: { medya_dosya_id: string; sira: number }[];
  duzenlenebilir: boolean;
  surum: number;
  created_at: string;
}

export function kayitCevir(k: ApiKayit): GunlukKayit {
  return {
    id: k.id,
    ogrenciId: k.ogrenci_id,
    gun: k.gun,
    bransKodu: k.brans_kodu,
    konuId: k.konu_id,
    konuAd: k.konu_ad,
    zorluk: k.zorluk,
    kaynakTestId: k.kaynak_test_id,
    kaynakKitapId: k.kaynak_kitap_id,
    kaynakMetin: k.kaynak_metin,
    dogru: k.dogru,
    yanlis: k.yanlis,
    bos: k.bos,
    toplam: k.toplam,
    planGorevId: k.plan_gorev_id,
    dosyalar: [...k.dosyalar].sort((a, b) => a.sira - b.sira).map((d) => d.medya_dosya_id),
    duzenlenebilir: k.duzenlenebilir,
    surum: k.surum,
    olusturma: k.created_at,
  };
}

interface ApiHucre {
  cozulen: number;
  dogru: number;
  yanlis: number;
  bos: number;
  basari: number | null;
}

const hucreCevir = (h: ApiHucre): Hucre => ({
  cozulen: h.cozulen,
  dogru: h.dogru,
  yanlis: h.yanlis,
  bos: h.bos,
  basari: h.basari,
});

interface ApiBant {
  durum: BantTespiti['durum'];
  bant: Zorluk | null;
  bant_basarilari: Record<Zorluk, number | null>;
}

const bantCevir = (b: ApiBant): BantTespiti => ({
  durum: b.durum,
  bant: b.bant,
  bantBasarilari: {
    kolay: b.bant_basarilari.kolay,
    orta: b.bant_basarilari.orta,
    zor: b.bant_basarilari.zor,
  },
});

interface ApiKonuAnalizi {
  konu_id: string;
  konu_ad: string | null;
  ust_konu_ad: string | null;
  hucreler: Record<AnalizZorlugu, ApiHucre>;
  toplam: ApiHucre;
  bant: ApiBant;
}

const konuAnaliziCevir = (k: ApiKonuAnalizi): KonuAnalizi => ({
  konuId: k.konu_id,
  konuAd: k.konu_ad,
  ustKonuAd: k.ust_konu_ad,
  hucreler: {
    kolay: hucreCevir(k.hucreler.kolay),
    orta: hucreCevir(k.hucreler.orta),
    zor: hucreCevir(k.hucreler.zor),
    belirtilmemis: hucreCevir(k.hucreler.belirtilmemis),
  },
  toplam: hucreCevir(k.toplam),
  bant: bantCevir(k.bant),
});

export type ApiOneri =
  | {
      tur: 'gorev_oner';
      brans_kodu: string;
      konu_id: string;
      konu_ad: string | null;
      zorluk: Zorluk;
      soru_sayisi: number;
      basari: number | null;
    }
  | {
      tur: 'birebir_ders';
      brans_kodu: string;
      konu_id: string;
      konu_ad: string | null;
      zor_basari: number;
      onceki_hafta_basari: number | null;
      son_hafta_basari: number | null;
    };

export function oneriCevir(o: ApiOneri): Oneri {
  if (o.tur === 'gorev_oner') {
    return {
      tur: 'gorev_oner',
      bransKodu: o.brans_kodu,
      konuId: o.konu_id,
      konuAd: o.konu_ad,
      zorluk: o.zorluk,
      soruSayisi: o.soru_sayisi,
      basari: o.basari,
    };
  }
  return {
    tur: 'birebir_ders',
    bransKodu: o.brans_kodu,
    konuId: o.konu_id,
    konuAd: o.konu_ad,
    zorBasari: o.zor_basari,
    oncekiHaftaBasari: o.onceki_hafta_basari,
    sonHaftaBasari: o.son_hafta_basari,
  };
}

interface ApiAnaliz {
  ogrenci_id: string;
  brans_kodu: string;
  bas: string;
  bit: string;
  konular: ApiKonuAnalizi[];
  toplam: ApiHucre;
  oneriler?: ApiOneri[];
}

function analizCevir(a: ApiAnaliz): Analiz {
  return {
    ogrenciId: a.ogrenci_id,
    bransKodu: a.brans_kodu,
    bas: a.bas,
    bit: a.bit,
    konular: a.konular.map(konuAnaliziCevir),
    toplam: hucreCevir(a.toplam),
    // Ogrenci yanitinda alan yoktur: yoksa bos dizi UYDURULMAZ.
    ...(a.oneriler ? { oneriler: a.oneriler.map(oneriCevir) } : {}),
  };
}

interface ApiKitap {
  id: string;
  ad: string;
  yayinevi: string | null;
  brans_kodu: string;
  aktif: boolean;
  test_sayisi: number;
  toplam_soru: number;
  ilerleme: { cozulen_test: number; toplam_test: number } | null;
}

const kitapCevir = (k: ApiKitap): KaynakKitap => ({
  id: k.id,
  ad: k.ad,
  yayinevi: k.yayinevi,
  bransKodu: k.brans_kodu,
  aktif: k.aktif,
  testSayisi: k.test_sayisi,
  toplamSoru: k.toplam_soru,
  ilerleme: k.ilerleme
    ? { cozulenTest: k.ilerleme.cozulen_test, toplamTest: k.ilerleme.toplam_test }
    : null,
});

interface ApiTest {
  id: string;
  kitap_id: string;
  sira: number;
  ad: string;
  soru_sayisi: number;
  konu_id: string | null;
  cozuldu_gun?: string | null;
}

const testCevir = (t: ApiTest): KaynakTest => ({
  id: t.id,
  kitapId: t.kitap_id,
  sira: t.sira,
  ad: t.ad,
  soruSayisi: t.soru_sayisi,
  konuId: t.konu_id,
  cozulduGun: t.cozuldu_gun ?? null,
});

interface ApiHucreDetayi {
  ogrenci_id: string;
  konu_id: string;
  kayitlar: {
    kaynak: 'gunluk' | 'odev';
    id: string;
    gun: string;
    zorluk: AnalizZorlugu;
    kaynak_adi: string | null;
    dogru: number;
    yanlis: number;
    bos: number;
    toplam: number;
    dosyalar: {
      medya_dosya_id: string;
      adres: { asil_url: string; orta_url: string | null } | null;
    }[];
  }[];
  fotograf_adresleri_alinamadi: boolean;
}

function hucreDetayCevir(d: ApiHucreDetayi): HucreDetayi {
  return {
    ogrenciId: d.ogrenci_id,
    konuId: d.konu_id,
    kayitlar: d.kayitlar.map((k) => ({
      kaynak: k.kaynak,
      id: k.id,
      gun: k.gun,
      zorluk: k.zorluk,
      kaynakAdi: k.kaynak_adi,
      dogru: k.dogru,
      yanlis: k.yanlis,
      bos: k.bos,
      toplam: k.toplam,
      dosyalar: k.dosyalar.map((f) => ({
        medyaDosyaId: f.medya_dosya_id,
        adres: f.adres ? (f.adres.orta_url ?? f.adres.asil_url) : null,
      })),
    })),
    fotografAdresleriAlinamadi: d.fotograf_adresleri_alinamadi,
  };
}

const SAYFA = 50;

/** Gunluk soru, kaynak kitap, analiz ve "gorev ver" uclarini adaptor modeline ceviren gercek uygulama. */
export function gunlukSoruAdaptoru(b: OperasyonBagimliligi): GunlukSoruAdapter {
  const { yetkili, veriAl } = b;

  return {
    async kayitOlustur(g) {
      const sonuc = await yetkili.POST('/v1/ogrenme/kurumlar/{kurum_id}/gunluk-soru/kayitlar', {
        params: { path: { kurum_id: b.etkinKurum() } },
        body: {
          ...(g.gun ? { gun: g.gun } : {}),
          brans_kodu: g.bransKodu,
          konu_id: g.konuId,
          zorluk: g.zorluk,
          ...(g.kaynakTestId ? { kaynak_test_id: g.kaynakTestId } : {}),
          ...(g.kaynakMetin ? { kaynak_metin: g.kaynakMetin } : {}),
          dogru: g.dogru,
          yanlis: g.yanlis,
          bos: g.bos,
          ...(g.planGorevId ? { plan_gorev_id: g.planGorevId } : {}),
          dosya_idleri: g.dosyaIdleri,
          istek_id: g.istekId,
        },
      });
      const kayit = veriAl(sonuc);
      // 201: yeni kayit; 200: ayni `istek_id` ile daha once acilmis kayit (cevrimdisi tekrar guvenli).
      return { kayit: kayitCevir(kayit), yeni: sonuc.response.status === 201 };
    },

    async kayitDuzelt(id, g) {
      const d = veriAl(
        await yetkili.PATCH('/v1/ogrenme/kurumlar/{kurum_id}/gunluk-soru/kayitlar/{id}', {
          params: { path: { kurum_id: b.etkinKurum(), id } },
          body: {
            ...(g.bransKodu !== undefined ? { brans_kodu: g.bransKodu } : {}),
            ...(g.konuId !== undefined ? { konu_id: g.konuId } : {}),
            ...(g.zorluk !== undefined ? { zorluk: g.zorluk } : {}),
            ...(g.kaynakTestId !== undefined ? { kaynak_test_id: g.kaynakTestId } : {}),
            ...(g.kaynakMetin !== undefined ? { kaynak_metin: g.kaynakMetin } : {}),
            ...(g.dogru !== undefined ? { dogru: g.dogru } : {}),
            ...(g.yanlis !== undefined ? { yanlis: g.yanlis } : {}),
            ...(g.bos !== undefined ? { bos: g.bos } : {}),
            ...(g.planGorevId !== undefined ? { plan_gorev_id: g.planGorevId } : {}),
            ...(g.dosyaIdleri !== undefined ? { dosya_idleri: g.dosyaIdleri } : {}),
            ...(g.surum !== undefined ? { surum: g.surum } : {}),
          },
        }),
      );
      return kayitCevir(d);
    },

    async kayitSil(id) {
      const s = await yetkili.DELETE('/v1/ogrenme/kurumlar/{kurum_id}/gunluk-soru/kayitlar/{id}', {
        params: { path: { kurum_id: b.etkinKurum(), id } },
      });
      // 204: govde yok; `veriAl` `data === undefined` ile hata sayar, bu yuzden durumdan karar verilir.
      if (s.response.status !== 204) veriAl({ error: s.error, response: s.response });
    },

    async kayitlarim(s, imlec) {
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/gunluk-soru/kayitlar', {
          params: {
            path: { kurum_id: b.etkinKurum() },
            query: {
              limit: SAYFA,
              ...(s.gun ? { gun: s.gun } : {}),
              ...(s.bas ? { bas: s.bas } : {}),
              ...(s.bit ? { bit: s.bit } : {}),
              ...(s.bransKodu ? { brans_kodu: s.bransKodu } : {}),
              ...(imlec ? { imlec } : {}),
            },
          },
        }),
      );
      return {
        kayitlar: (d.kayitlar as unknown as ApiKayit[]).map(kayitCevir),
        sonrakiImlec: d.sonraki_imlec,
      };
    },

    async sonKullanilanlar(): Promise<SonKullanilanlar> {
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/gunluk-soru/son-kullanilanlar', {
          params: { path: { kurum_id: b.etkinKurum() } },
        }),
      );
      return {
        dersler: d.dersler.map((x) => ({
          bransKodu: x.brans_kodu,
          sonKullanildi: x.son_kullanildi_at,
          konular: x.konular.map((k) => ({
            konuId: k.konu_id,
            konuAd: k.konu_ad,
            sonZorluk: k.son_zorluk,
          })),
          kaynaklar: x.kaynaklar.map((k) => ({
            kaynakTestId: k.kaynak_test_id,
            kaynakKitapId: k.kaynak_kitap_id,
            kitapAd: k.kitap_ad,
            testAd: k.test_ad,
            kaynakMetin: k.kaynak_metin,
          })),
        })),
      };
    },

    async kaynakKitaplar(s = {}) {
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/kaynak-kitaplar', {
          params: {
            path: { kurum_id: b.etkinKurum() },
            query: {
              ...(s.bransKodu ? { brans_kodu: s.bransKodu } : {}),
              ...(s.ogrenciId ? { ogrenci_id: s.ogrenciId } : {}),
              ...(s.pasifler ? { pasifler: true } : {}),
            },
          },
        }),
      );
      return (d.kitaplar as unknown as ApiKitap[]).map(kitapCevir);
    },

    async kaynakKitap(id, ogrenciId): Promise<KaynakKitapDetayi> {
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/kaynak-kitaplar/{id}', {
          params: {
            path: { kurum_id: b.etkinKurum(), id },
            query: ogrenciId ? { ogrenci_id: ogrenciId } : {},
          },
        }),
      );
      const kitap = d as unknown as ApiKitap & { testler: ApiTest[] };
      return { ...kitapCevir(kitap), testler: kitap.testler.map(testCevir) };
    },

    async analiz(s, ogrenciId) {
      const kurum_id = b.etkinKurum();
      const query = { brans_kodu: s.bransKodu, donem: s.donem };
      const d = ogrenciId
        ? veriAl(
            await yetkili.GET(
              '/v1/ogrenme/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/gunluk-soru/analiz',
              { params: { path: { kurum_id, ogrenci_id: ogrenciId }, query } },
            ),
          )
        : veriAl(
            await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/gunluk-soru/analiz', {
              params: { path: { kurum_id }, query },
            }),
          );
      return analizCevir(d);
    },

    async hucre(s, ogrenciId) {
      const kurum_id = b.etkinKurum();
      const query = {
        brans_kodu: s.bransKodu,
        konu_id: s.konuId,
        donem: s.donem,
        ...(s.zorluk ? { zorluk: s.zorluk } : {}),
      };
      const d = ogrenciId
        ? veriAl(
            await yetkili.GET(
              '/v1/ogrenme/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/gunluk-soru/analiz/hucre',
              { params: { path: { kurum_id, ogrenci_id: ogrenciId }, query } },
            ),
          )
        : veriAl(
            await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/gunluk-soru/analiz/hucre', {
              params: { path: { kurum_id }, query },
            }),
          );
      return hucreDetayCevir(d);
    },

    async haftalikOzet(ogrenciId, hafta) {
      const d = veriAl(
        await yetkili.GET(
          '/v1/ogrenme/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/gunluk-soru/haftalik-ozet',
          {
            params: {
              path: { kurum_id: b.etkinKurum(), ogrenci_id: ogrenciId },
              query: hafta ? { hafta } : {},
            },
          },
        ),
      );
      return {
        ogrenciId: d.ogrenci_id,
        haftaBaslangic: d.hafta_baslangic,
        cozulen: d.cozulen,
        dogru: d.dogru,
        yanlis: d.yanlis,
        bos: d.bos,
        basari: d.basari,
        enZayifKonular: d.en_zayif_konular.map((k) => ({
          bransKodu: k.brans_kodu,
          konuId: k.konu_id,
          konuAd: k.konu_ad,
          cozulen: k.cozulen,
          basari: k.basari,
        })),
        bant: {
          onceki: bantCevir(d.bant.onceki),
          simdiki: bantCevir(d.bant.simdiki),
          degisim: d.bant.degisim,
        },
      };
    },

    async gorevVer(ogrenciId, g) {
      const d = veriAl(
        await yetkili.POST(
          '/v1/ogrenme/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/gunluk-soru/gorev-ver',
          {
            params: { path: { kurum_id: b.etkinKurum(), ogrenci_id: ogrenciId } },
            body: {
              tur: g.tur,
              brans_kodu: g.bransKodu,
              konu_id: g.konuId,
              zorluk: g.zorluk,
              soru_sayisi: g.soruSayisi,
              ...(g.gun ? { gun: g.gun } : {}),
            },
          },
        ),
      );
      if (d.tur === 'plan_gorevi') {
        return {
          tur: 'plan_gorevi',
          planId: d.plan_id,
          gorevId: d.gorev_id,
          haftaBaslangic: d.hafta_baslangic,
          gun: d.gun,
          planDurum: d.plan_durum,
        };
      }
      return { tur: 'odev', odevId: d.odev_id, sonTeslim: d.son_teslim_at };
    },
  };
}
