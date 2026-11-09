import type { ServisIstemcileri } from '@kopru/api-client';

import { haftaninGunu, VARSAYILAN_SAAT_DILIMI } from '../lib/saat';
import type {
  BekleyenYoklamaDersi,
  Ders,
  DersAdapter,
  DersGrubu,
  FinansAdapter,
  FinansHareketi,
  GrupTuru,
  OgrenciKarti,
} from './operasyonTipleri';

type Istemci = ServisIstemcileri['api'];

export interface OperasyonBagimliligi {
  /** Yetkili (belirteci otomatik yenilenen) api istemcisi. */
  yetkili: Istemci;
  /** Etkin kurum; yoksa `bulunamadi` firlatir. */
  etkinKurum: () => string;
  /** Basarisiz yaniti `ApiHata` olarak firlatir; basariliysa veriyi dondurur. */
  veriAl: <T>(sonuc: { data?: T; error?: unknown; response: Response }) => T;
}

interface ApiDers {
  id: string;
  grup_id: string;
  seri_id: string | null;
  ogretmen_id: string;
  brans_kodu: string;
  baslik: string | null;
  baslangic_at: string;
  bitis_at: string;
  durum: 'planli' | 'tamamlandi' | 'iptal';
  iptal_nedeni: string | null;
  seri_istisna: boolean;
  online_baglanti: string | null;
  yer: string | null;
  katilimci_sayisi: number;
  surum: number;
}

export function dersCevir(d: ApiDers): Ders {
  return {
    id: d.id,
    grupId: d.grup_id,
    seriId: d.seri_id,
    ogretmenId: d.ogretmen_id,
    bransKodu: d.brans_kodu,
    baslik: d.baslik,
    baslangic: d.baslangic_at,
    bitis: d.bitis_at,
    durum: d.durum,
    iptalNedeni: d.iptal_nedeni,
    seriIstisna: d.seri_istisna,
    onlineBaglanti: d.online_baglanti,
    yer: d.yer,
    katilimciSayisi: d.katilimci_sayisi,
    surum: d.surum,
  };
}

const SAYFA_UST = 10;

/** `ders`, yoklama ve `finans` uclarini adaptor modeline ceviren gercek uygulama. */
export function operasyonAdaptorleri(b: OperasyonBagimliligi): {
  ders: DersAdapter;
  finans: FinansAdapter;
} {
  const { yetkili, veriAl } = b;
  let saatDilimiOnbellek: { kurumId: string; tz: string } | null = null;

  const ders: DersAdapter = {
    async saatDilimi() {
      const kurumId = b.etkinKurum();
      if (saatDilimiOnbellek?.kurumId === kurumId) return saatDilimiOnbellek.tz;
      try {
        const k = veriAl(
          await yetkili.GET('/v1/hesap/kurumlar/{kurum_id}', {
            params: { path: { kurum_id: kurumId } },
          }),
        );
        saatDilimiOnbellek = { kurumId, tz: k.saat_dilimi };
        return k.saat_dilimi;
      } catch {
        // Rolun kurum okuma izni olmayabilir; varsayilan kurum saat dilimi.
        return VARSAYILAN_SAAT_DILIMI;
      }
    },

    async dersler(baslangic, bitis) {
      const kurum_id = b.etkinKurum();
      const sonuc: Ders[] = [];
      let imlec: string | undefined;
      for (let s = 0; s < SAYFA_UST; s++) {
        const d = veriAl(
          await yetkili.GET('/v1/ders/kurumlar/{kurum_id}/dersler', {
            params: {
              path: { kurum_id },
              query: { baslangic, bitis, limit: 200, ...(imlec ? { imlec } : {}) },
            },
          }),
        );
        sonuc.push(...d.dersler.map(dersCevir));
        if (!d.sonraki_imlec) break;
        imlec = d.sonraki_imlec;
      }
      return sonuc;
    },

    async gruplar() {
      const kurum_id = b.etkinKurum();
      const liste: { id: string; ad: string; tur: GrupTuru; uye_sayisi: number }[] = [];
      let imlec: string | undefined;
      for (let s = 0; s < SAYFA_UST; s++) {
        const d = veriAl(
          await yetkili.GET('/v1/hesap/kurumlar/{kurum_id}/gruplar', {
            params: {
              path: { kurum_id },
              query: { durum: 'aktif', limit: 100, ...(imlec ? { imlec } : {}) },
            },
          }),
        );
        liste.push(...d.gruplar);
        if (!d.sonraki_imlec) break;
        imlec = d.sonraki_imlec;
      }
      // Birebir grubun adi ogrencinin adidir: tek uyeyi okuyup etiketlenir.
      return Promise.all(
        liste.map(async (g): Promise<DersGrubu> => {
          let ogrenciAd: string | null = null;
          if (g.tur === 'birebir') {
            try {
              const u = veriAl(
                await yetkili.GET('/v1/hesap/kurumlar/{kurum_id}/gruplar/{grup_id}/uyeler', {
                  params: { path: { kurum_id, grup_id: g.id } },
                }),
              );
              ogrenciAd = u.uyeler[0]?.gorunen_ad ?? null;
            } catch {
              ogrenciAd = null;
            }
          }
          return { id: g.id, ad: g.ad, tur: g.tur, uyeSayisi: g.uye_sayisi, ogrenciAd };
        }),
      );
    },

    async dersOlustur(g) {
      const kurum_id = b.etkinKurum();
      const ortak = {
        grup_id: g.grupId,
        baslangic_saati: g.saat,
        sure_dk: g.sureDk,
        cakisma_onayli: g.cakismaOnayli,
        ...(g.bransKodu ? { brans_kodu: g.bransKodu } : {}),
        ...(g.baslik ? { baslik: g.baslik } : {}),
        ...(g.onlineBaglanti ? { online_baglanti: g.onlineBaglanti } : {}),
        ...(g.yer ? { yer: g.yer } : {}),
      };
      if (!g.haftalik) {
        const d = veriAl(
          await yetkili.POST('/v1/ders/kurumlar/{kurum_id}/dersler', {
            params: { path: { kurum_id } },
            body: { ...ortak, tarih: g.tarih },
          }),
        );
        return {
          dersler: [dersCevir(d.ders)],
          cakisanlar: [],
          ogrenciCakismasi: d.uyari.length > 0,
          atlanan: 0,
        };
      }
      const d = veriAl(
        await yetkili.POST('/v1/ders/kurumlar/{kurum_id}/seriler', {
          params: { path: { kurum_id } },
          body: {
            ...ortak,
            tekrar_kurali: `FREQ=WEEKLY;INTERVAL=1;BYDAY=${haftaninGunu(g.tarih)}`,
            baslangic_tarihi: g.tarih,
            ...(g.bitisTarihi ? { bitis_tarihi: g.bitisTarihi } : {}),
          },
        }),
      );
      return {
        dersler: d.dersler.map(dersCevir),
        cakisanlar: d.cakisanlar.map((c) => ({
          id: c.id,
          grupId: c.grup_id,
          baslik: c.baslik,
          baslangic: c.baslangic_at,
          bitis: c.bitis_at,
        })),
        ogrenciCakismasi: d.uyari.length > 0,
        atlanan: d.atlanan.length,
      };
    },

    async dersTasi(d, g) {
      const kurum_id = b.etkinKurum();
      const r = veriAl(
        await yetkili.POST('/v1/ders/kurumlar/{kurum_id}/dersler/{id}/tasi', {
          params: { path: { kurum_id, id: d.id } },
          body: {
            surum: d.surum,
            kapsam: g.kapsam,
            cakisma_onayli: g.cakismaOnayli,
            ...(g.yeniTarih ? { yeni_tarih: g.yeniTarih } : {}),
            ...(g.yeniSaat ? { yeni_saat: g.yeniSaat } : {}),
          },
        }),
      );
      return { etkilenen: r.etkilenen_ders_idleri.length, ogrenciCakismasi: r.uyari.length > 0 };
    },

    async dersIptal(d, g) {
      const kurum_id = b.etkinKurum();
      const r = veriAl(
        await yetkili.POST('/v1/ders/kurumlar/{kurum_id}/dersler/{id}/iptal', {
          params: { path: { kurum_id, id: d.id } },
          body: {
            surum: d.surum,
            kapsam: g.kapsam,
            iptal_kaynagi: g.kaynak,
            ...(g.neden ? { iptal_nedeni: g.neden } : {}),
          },
        }),
      );
      return { etkilenen: r.etkilenen_ders_idleri.length, ogrenciCakismasi: false };
    },

    async yoklamaBekleyen() {
      const kurum_id = b.etkinKurum();
      const sonuc: BekleyenYoklamaDersi[] = [];
      let imlec: string | undefined;
      for (let s = 0; s < 3; s++) {
        const d = veriAl(
          await yetkili.GET('/v1/ders/kurumlar/{kurum_id}/yoklama-bekleyen', {
            params: { path: { kurum_id }, query: { limit: 50, ...(imlec ? { imlec } : {}) } },
          }),
        );
        sonuc.push(
          ...d.dersler.map((x) => ({
            ...dersCevir(x),
            yoklamasiEksikSayisi: x.yoklamasi_eksik_sayisi,
          })),
        );
        if (!d.sonraki_imlec) break;
        imlec = d.sonraki_imlec;
      }
      return sonuc;
    },

    async yoklamaKatilimcilari(dersId) {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.GET('/v1/ders/kurumlar/{kurum_id}/dersler/{id}/yoklamalar', {
          params: { path: { kurum_id, id: dersId } },
        }),
      );
      return d.katilimcilar.map((k) => ({
        ogrenciId: k.ogrenci_id,
        ad: k.gorunen_ad ?? '',
        tur: k.tur,
        durum: k.yoklama?.durum ?? null,
        not: k.yoklama?.not ?? null,
      }));
    },

    async yoklamaKaydet(dersId, satirlar, istekId) {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.PUT('/v1/ders/kurumlar/{kurum_id}/dersler/{id}/yoklamalar', {
          params: {
            path: { kurum_id, id: dersId },
            header: { 'idempotency-key': istekId },
          },
          body: {
            yoklamalar: satirlar.map((s) => ({
              ogrenci_id: s.ogrenciId,
              durum: s.durum,
              isaretlenme_at: s.isaretlenmeAt,
              ...(s.gecDakika !== undefined ? { gec_dakika: s.gecDakika } : {}),
              ...(s.not ? { not: s.not } : {}),
              ...(s.notGorunurluk ? { not_gorunurluk: s.notGorunurluk } : {}),
            })),
          },
        }),
      );
      return {
        dersId: d.ders_id,
        sonuclar: d.sonuclar.map((x) => ({
          ogrenciId: x.ogrenci_id,
          sonuc: x.sonuc,
          kalanKredi: x.kalan_kredi,
        })),
      };
    },
  };

  const finans: FinansAdapter = {
    async paketler() {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.GET('/v1/finans/kurumlar/{kurum_id}/paketler', {
          params: { path: { kurum_id }, query: { durum: 'aktif', limit: 100 } },
        }),
      );
      return d.paketler.map((p) => ({
        id: p.id,
        ad: p.ad,
        krediAdedi: p.kredi_adedi,
        fiyatKurus: p.fiyat_kurus,
        gecerlilikGun: p.gecerlilik_gun,
      }));
    },

    async ogrenciler() {
      const kurum_id = b.etkinKurum();
      const ogrenciler: {
        ogrenciId: string;
        ad: string;
        model: 'paket' | 'ders_basi' | 'yok';
        kalanKredi: number;
        bakiyeKurus: number;
        borclu: boolean;
      }[] = [];
      let esik = 2;
      let imlec: string | undefined;
      for (let s = 0; s < SAYFA_UST; s++) {
        const d = veriAl(
          await yetkili.GET('/v1/finans/kurumlar/{kurum_id}/ogrenciler', {
            params: { path: { kurum_id }, query: { limit: 200, ...(imlec ? { imlec } : {}) } },
          }),
        );
        esik = d.dusuk_kredi_esigi;
        for (const o of d.ogrenciler) {
          ogrenciler.push({
            ogrenciId: o.ogrenci_id,
            ad: o.gorunen_ad ?? '',
            model: o.model,
            kalanKredi: o.kalan_kredi,
            bakiyeKurus: o.bakiye_kurus,
            borclu: o.borclu,
          });
        }
        if (!d.sonraki_imlec) break;
        imlec = d.sonraki_imlec;
      }
      return { ogrenciler, dusukKrediEsigi: esik };
    },

    async ogrenciKarti(ogrenciId): Promise<OgrenciKarti> {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.GET('/v1/finans/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/finans', {
          params: { path: { kurum_id, ogrenci_id: ogrenciId } },
        }),
      );
      if (d.gorunum === 'ogrenci') {
        return { gorunum: 'ogrenci', ogrenciId: d.ogrenci_id, kalanKredi: d.kalan_kredi };
      }
      const hareketler: FinansHareketi[] = [
        ...d.son_kredi_hareketleri.map((h) => ({
          id: h.id,
          tur: 'kredi' as const,
          turKodu: h.tur,
          miktar: h.miktar,
          tarih: h.created_at,
        })),
        ...d.son_bakiye_hareketleri.map((h) => ({
          id: h.id,
          tur: 'bakiye' as const,
          turKodu: h.tur,
          miktar: h.tutar_kurus,
          tarih: h.created_at,
        })),
      ]
        .sort((x, y) => Date.parse(y.tarih) - Date.parse(x.tarih))
        .slice(0, 10);
      return {
        gorunum: 'tam',
        ogrenciId: d.ogrenci_id,
        model: d.model,
        kalanKredi: d.kalan_kredi,
        dusukKrediEsigi: d.dusuk_kredi_esigi,
        bakiyeKurus: d.bakiye_kurus,
        borclu: d.borclu,
        etkinPaketler: d.etkin_paketler.map((p) => ({
          id: p.id,
          ad: p.ad,
          toplamKredi: p.toplam_kredi,
          kalanKredi: p.kalan_kredi,
          bitisTarihi: p.bitis_tarihi,
        })),
        hareketler,
        odeyenAd: d.odeyen_ad,
        odeyenTelefon: d.odeyen_telefon,
      };
    },

    async paketSat(g) {
      const kurum_id = b.etkinKurum();
      const odeme =
        g.odeme.tur === 'sonra'
          ? ({ tur: 'sonra' } as const)
          : g.odeme.tur === 'tamami'
            ? ({ tur: 'tamami', yontem: g.odeme.yontem } as const)
            : ({
                tur: 'kismi',
                yontem: g.odeme.yontem,
                tutar_kurus: g.odeme.tutarKurus,
              } as const);
      const d = veriAl(
        await yetkili.POST('/v1/finans/kurumlar/{kurum_id}/paket-satislari', {
          params: { path: { kurum_id } },
          body: { ogrenci_id: g.ogrenciId, paket_id: g.paketId, odeme },
        }),
      );
      return { kalanKredi: d.kalan_kredi, bakiyeKurus: d.bakiye_kurus };
    },

    async tahsilatAl(g, istekId) {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.POST('/v1/finans/kurumlar/{kurum_id}/tahsilatlar', {
          params: { path: { kurum_id }, header: { 'idempotency-key': istekId } },
          body: { ogrenci_id: g.ogrenciId, tutar_kurus: g.tutarKurus, yontem: g.yontem },
        }),
      );
      return { tekrar: d.tekrar };
    },
  };

  return { ders, finans };
}
