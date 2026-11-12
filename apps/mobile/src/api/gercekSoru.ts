import type { OperasyonBagimliligi } from './gercekOperasyon';
import type {
  EkGirdisi,
  KuyrukSayisi,
  Musaitlik,
  OkumaAdresi,
  SoruAdapter,
  SoruDetayi,
  SoruDurumu,
  SoruEki,
  SoruEkTuru,
  SoruKotasi,
  SoruMesaji,
  SoruMesajTuru,
  SoruOzeti,
  SoruTahmini,
  SoruYazarRolu,
} from './soruTipleri';

const SAYFA = 20;

interface ApiAdres {
  mime_tipi: string;
  asil_url: string;
  kucuk_url: string | null;
  orta_url: string | null;
  genislik: number | null;
  yukseklik: number | null;
  sure_sn: number | null;
  gecerlilik_bitis_at: string;
}

function adresCevir(a: ApiAdres | null): OkumaAdresi | null {
  if (!a) return null;
  return {
    mimeTipi: a.mime_tipi,
    asilUrl: a.asil_url,
    kucukUrl: a.kucuk_url,
    ortaUrl: a.orta_url,
    genislik: a.genislik,
    yukseklik: a.yukseklik,
    sureSn: a.sure_sn,
    bitis: a.gecerlilik_bitis_at,
  };
}

interface ApiEk {
  id: string;
  tur: SoruEkTuru;
  medya_dosya_id: string;
  kaynak_dosya_id: string | null;
  sure_sn: number | null;
  cizim_verisi: unknown;
  sira: number;
  adres: ApiAdres | null;
}

function ekCevir(e: ApiEk): SoruEki {
  return {
    id: e.id,
    tur: e.tur,
    medyaDosyaId: e.medya_dosya_id,
    kaynakDosyaId: e.kaynak_dosya_id,
    sureSn: e.sure_sn,
    cizimVerisi: e.cizim_verisi,
    sira: e.sira,
    adres: adresCevir(e.adres),
  };
}

interface ApiMesaj {
  id: string;
  yazar_id: string;
  yazar_adi: string | null;
  yazar_rolu: SoruYazarRolu;
  tur: SoruMesajTuru;
  metin: string | null;
  derste_konusalim: boolean;
  sira: number;
  created_at: string;
  ekler: ApiEk[];
}

function mesajCevir(m: ApiMesaj): SoruMesaji {
  return {
    id: m.id,
    yazarId: m.yazar_id,
    yazarAdi: m.yazar_adi,
    yazarRolu: m.yazar_rolu,
    tur: m.tur,
    metin: m.metin,
    dersteKonusalim: m.derste_konusalim,
    sira: m.sira,
    olusturma: m.created_at,
    ekler: m.ekler.map(ekCevir),
  };
}

interface ApiOzet {
  id: string;
  ogrenci_id: string;
  ogrenci_adi: string | null;
  brans_kodu: string;
  konu_id: string | null;
  baslik: string | null;
  metin_onizleme: string | null;
  durum: SoruDurumu;
  mesaj_sayisi: number;
  created_at: string;
  son_hareket_at: string;
  ilk_cevap_at: string | null;
  cozuldu_at: string | null;
}

function ozetCevir(s: ApiOzet): SoruOzeti {
  return {
    id: s.id,
    ogrenciId: s.ogrenci_id,
    ogrenciAdi: s.ogrenci_adi,
    bransKodu: s.brans_kodu,
    konuId: s.konu_id,
    baslik: s.baslik,
    onizleme: s.metin_onizleme,
    durum: s.durum,
    mesajSayisi: s.mesaj_sayisi,
    olusturma: s.created_at,
    sonHareket: s.son_hareket_at,
    ilkCevap: s.ilk_cevap_at,
    cozuldu: s.cozuldu_at,
  };
}

interface ApiDetay extends ApiOzet {
  foto_silinme_at: string | null;
  yeniden_acilma_sayisi: number;
  kalan_takip_hakki: number;
  fotograflar: { medya_dosya_id: string; sira: number; adres: ApiAdres | null }[];
  mesajlar: ApiMesaj[];
  adres_alinamadi: boolean;
}

function detayCevir(s: ApiDetay): SoruDetayi {
  return {
    ...ozetCevir(s),
    fotoSilinme: s.foto_silinme_at,
    yenidenAcmaSayisi: s.yeniden_acilma_sayisi,
    kalanTakipHakki: s.kalan_takip_hakki,
    fotograflar: s.fotograflar.map((f) => ({
      medyaDosyaId: f.medya_dosya_id,
      sira: f.sira,
      adres: adresCevir(f.adres),
    })),
    mesajlar: s.mesajlar.map(mesajCevir),
    adresAlinamadi: s.adres_alinamadi,
  };
}

interface ApiKota {
  gunluk_limit: number | null;
  gunluk_kullanilan: number;
  gunluk_kalan: number | null;
  gunluk_sifirlanma_at: string;
  aylik_kalan: number | null;
  aylik_sifirlanma_at: string;
}

/** api hata `details.kota` ve 200 yanitlari ayni sekle sahiptir. */
export function kotaCevir(k: ApiKota): SoruKotasi {
  return {
    gunlukLimit: k.gunluk_limit,
    gunlukKullanilan: k.gunluk_kullanilan,
    gunlukKalan: k.gunluk_kalan,
    gunlukSifirlanma: k.gunluk_sifirlanma_at,
    aylikKalan: k.aylik_kalan,
    aylikSifirlanma: k.aylik_sifirlanma_at,
  };
}

function tahminCevir(t: {
  sure_sn: number | null;
  ornek_sayisi: number;
  hedef_musait: boolean | null;
}): SoruTahmini {
  return { sureSn: t.sure_sn, ornekSayisi: t.ornek_sayisi, hedefMusait: t.hedef_musait };
}

type ApiEkGirdisi =
  | { tur: 'fotograf'; medya_dosya_id: string }
  | {
      tur: 'cizimli_fotograf';
      medya_dosya_id: string;
      kaynak_dosya_id: string;
      cizim_verisi?: Record<string, unknown> | unknown[];
    }
  | { tur: 'ses'; medya_dosya_id: string; sure_sn?: number };

function ekGirdisiCevir(e: EkGirdisi): ApiEkGirdisi {
  if (e.tur === 'fotograf') return { tur: 'fotograf', medya_dosya_id: e.dosyaId };
  if (e.tur === 'ses') {
    return {
      tur: 'ses',
      medya_dosya_id: e.dosyaId,
      ...(e.sureSn ? { sure_sn: Math.max(1, Math.round(e.sureSn)) } : {}),
    };
  }
  return {
    tur: 'cizimli_fotograf',
    medya_dosya_id: e.dosyaId,
    kaynak_dosya_id: e.kaynakDosyaId,
    ...(e.cizimVerisi ? { cizim_verisi: e.cizimVerisi as Record<string, unknown> } : {}),
  };
}

/** `ogrenme` modulunun "soru sor" uclarini adaptor modeline ceviren gercek uygulama. */
export function soruAdaptoru(b: OperasyonBagimliligi): SoruAdapter {
  const { yetkili, veriAl } = b;

  return {
    async sorularim(suzgec, imlec) {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/sorularim', {
          params: {
            path: { kurum_id },
            query: {
              limit: SAYFA,
              ...(suzgec.bransKodu ? { brans_kodu: suzgec.bransKodu } : {}),
              ...(suzgec.durum ? { durum: suzgec.durum } : {}),
              ...(suzgec.q ? { q: suzgec.q } : {}),
              ...(imlec ? { imlec } : {}),
            },
          },
        }),
      );
      return { sorular: d.sorular.map(ozetCevir), sonrakiImlec: d.sonraki_imlec };
    },

    async kota() {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/soru-kotam', {
          params: { path: { kurum_id } },
        }),
      );
      return kotaCevir(d);
    },

    async soru(id) {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/sorular/{id}', {
          params: { path: { kurum_id, id } },
        }),
      );
      return detayCevir(d);
    },

    async soruSor(g) {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.POST('/v1/ogrenme/kurumlar/{kurum_id}/sorular', {
          params: { path: { kurum_id } },
          body: {
            brans_kodu: g.bransKodu,
            ...(g.konuId ? { konu_id: g.konuId } : {}),
            ...(g.baslik ? { baslik: g.baslik } : {}),
            ...(g.metin ? { metin: g.metin } : {}),
            fotograflar: g.fotograflar,
            ...(g.isaretler?.length
              ? {
                  isaretler: g.isaretler.map((i) => ({
                    medya_dosya_id: i.dosyaId,
                    kaynak_dosya_id: i.kaynakDosyaId,
                    ...(i.cizimVerisi
                      ? { cizim_verisi: i.cizimVerisi as Record<string, unknown> }
                      : {}),
                  })),
                }
              : {}),
            istek_id: g.istekId,
          },
        }),
      );
      const x = d as unknown as ApiDetay & {
        tekrar: boolean;
        kota: ApiKota;
        tahmini_cevap: Parameters<typeof tahminCevir>[0];
      };
      return {
        soru: detayCevir(x),
        tekrar: x.tekrar,
        kota: kotaCevir(x.kota),
        tahmin: tahminCevir(x.tahmini_cevap),
      };
    },

    async anladim(id) {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.POST('/v1/ogrenme/kurumlar/{kurum_id}/sorular/{id}/anladim', {
          params: { path: { kurum_id, id } },
          body: {} as never,
        }),
      );
      return detayCevir(d);
    },

    async takip(id, g) {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.POST('/v1/ogrenme/kurumlar/{kurum_id}/sorular/{id}/takip', {
          params: { path: { kurum_id, id } },
          body: {
            metin: g.metin,
            ...(g.ekler?.length ? { ekler: g.ekler.map((e) => ekGirdisiCevir(e) as never) } : {}),
            istek_id: g.istekId,
          },
        }),
      );
      return detayCevir(d);
    },

    async bildir(id, neden, aciklama, mesajId) {
      const kurum_id = b.etkinKurum();
      veriAl(
        await yetkili.POST('/v1/ogrenme/kurumlar/{kurum_id}/sorular/{id}/bildir', {
          params: { path: { kurum_id, id } },
          body: {
            neden,
            ...(aciklama ? { aciklama } : {}),
            ...(mesajId ? { mesaj_id: mesajId } : {}),
          },
        }),
      );
    },

    async gelenSorular(suzgec, imlec) {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/gelen-sorular', {
          params: {
            path: { kurum_id },
            query: {
              limit: SAYFA,
              ...(suzgec.bransKodu ? { brans_kodu: suzgec.bransKodu } : {}),
              ...(suzgec.ogrenciId ? { ogrenci_id: suzgec.ogrenciId } : {}),
              ...(imlec ? { imlec } : {}),
            },
          },
        }),
      );
      return { sorular: d.sorular.map(ozetCevir), sonrakiImlec: d.sonraki_imlec };
    },

    async gelenSoruSayisi(): Promise<KuyrukSayisi> {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/gelen-sorular/sayi', {
          params: { path: { kurum_id } },
        }),
      );
      return {
        bekleyen: d.bekleyen,
        branslar: d.branslar.map((x) => ({ bransKodu: x.brans_kodu, bekleyen: x.bekleyen })),
        enEski: d.en_eski_at,
      };
    },

    async cevapla(id, g) {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.POST('/v1/ogrenme/kurumlar/{kurum_id}/sorular/{id}/cevap', {
          params: { path: { kurum_id, id } },
          body: {
            ...(g.metin ? { metin: g.metin } : {}),
            derste_konusalim: g.dersteKonusalim,
            ...(g.ekler?.length ? { ekler: g.ekler.map((e) => ekGirdisiCevir(e) as never) } : {}),
            istek_id: g.istekId,
          },
        }),
      );
      return detayCevir(d);
    },

    async cevapladiklarim(suzgec, imlec) {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/cevapladigim-sorular', {
          params: {
            path: { kurum_id },
            query: {
              limit: SAYFA,
              ...(suzgec.bransKodu ? { brans_kodu: suzgec.bransKodu } : {}),
              ...(suzgec.ogrenciId ? { ogrenci_id: suzgec.ogrenciId } : {}),
              ...(suzgec.q ? { q: suzgec.q } : {}),
              ...(imlec ? { imlec } : {}),
            },
          },
        }),
      );
      return { sorular: d.sorular.map(ozetCevir), sonrakiImlec: d.sonraki_imlec };
    },

    async musaitlik(): Promise<Musaitlik> {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/soru-musaitligim', {
          params: { path: { kurum_id } },
        }),
      );
      return { musait: d.musait, musaitDegilTarihi: d.musait_degil_tarihi };
    },

    async musaitlikAyarla(musait): Promise<Musaitlik> {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.PUT('/v1/ogrenme/kurumlar/{kurum_id}/soru-musaitligim', {
          params: { path: { kurum_id } },
          body: { musait },
        }),
      );
      return { musait: d.musait, musaitDegilTarihi: d.musait_degil_tarihi };
    },
  };
}
