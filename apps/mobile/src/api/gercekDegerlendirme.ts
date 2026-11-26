import type {
  Degerlendirme,
  DegerlendirmeAdapter,
  DegerlendirmeGirdisi,
  DegerlendirmeGuncelleGirdisi,
  Kocluk,
  KaynakOneriGirdisi,
  KaynakOnerisi,
  OgrenciDegerlendirmesi,
  OlcekKodu,
  Olcekler,
  OneriTuru,
  PlanOzeti,
  ZayifKonu,
} from './degerlendirmeTipleri';
import { oneriCevir, type ApiOneri } from './gercekGunlukSoru';
import type { OperasyonBagimliligi } from './gercekOperasyon';

// --- Api govdeleri (snake_case) -------------------------------------------------------------

interface ApiOlcekler {
  calisma_duzeni: number | null;
  derse_katilim: number | null;
  odev_disiplini: number | null;
  anlama_duzeyi: number | null;
}

const olcekCevir = (o: ApiOlcekler): Olcekler => ({
  calisma_duzeni: o.calisma_duzeni,
  derse_katilim: o.derse_katilim,
  odev_disiplini: o.odev_disiplini,
  anlama_duzeyi: o.anlama_duzeyi,
});

interface ApiDegerlendirme extends ApiOlcekler {
  id: string;
  ogrenci_id: string;
  yazar_id: string;
  yazar_ad: string | null;
  benim: boolean;
  brans_kodu: string | null;
  donem_baslangic: string;
  donem_bitis: string;
  yorum: string | null;
  ogrenci_gorur: boolean;
  duzenlenebilir: boolean;
  duzenleme_son_at: string;
  geri_cekildi_at: string | null;
  surum: number;
  created_at: string;
}

export function degerlendirmeCevir(d: ApiDegerlendirme): Degerlendirme {
  return {
    id: d.id,
    ogrenciId: d.ogrenci_id,
    yazarId: d.yazar_id,
    yazarAd: d.yazar_ad,
    benim: d.benim,
    bransKodu: d.brans_kodu,
    donemBaslangic: d.donem_baslangic,
    donemBitis: d.donem_bitis,
    olcekler: olcekCevir(d),
    yorum: d.yorum,
    ogrenciGorur: d.ogrenci_gorur,
    duzenlenebilir: d.duzenlenebilir,
    duzenlemeSon: d.duzenleme_son_at,
    geriCekildi: d.geri_cekildi_at !== null,
    surum: d.surum,
    olusturma: d.created_at,
  };
}

/** Ogrenci yaniti: gorunurluk bayragi, yazar kimligi ve surum YOKTUR (api vermez). */
interface ApiOgrenciDegerlendirmesi extends ApiOlcekler {
  id: string;
  yazar_ad: string | null;
  brans_kodu: string | null;
  donem_baslangic: string;
  donem_bitis: string;
  yorum: string | null;
  created_at: string;
}

export function ogrenciDegerlendirmesiCevir(d: ApiOgrenciDegerlendirmesi): OgrenciDegerlendirmesi {
  return {
    id: d.id,
    yazarAd: d.yazar_ad,
    bransKodu: d.brans_kodu,
    donemBaslangic: d.donem_baslangic,
    donemBitis: d.donem_bitis,
    olcekler: olcekCevir(d),
    yorum: d.yorum,
    olusturma: d.created_at,
  };
}

interface ApiOneriKaydi {
  id: string;
  ogrenci_id: string;
  oneren_id: string;
  oneren_ad: string | null;
  benim: boolean;
  tur: OneriTuru;
  kaynak_kitap_id: string | null;
  kaynak_kitap_ad: string | null;
  kaynak_test_id: string | null;
  kaynak_test_ad: string | null;
  baglanti_url: string | null;
  baslik: string | null;
  brans_kodu: string | null;
  konu_id: string | null;
  konu_ad: string | null;
  not: string | null;
  basladi: boolean | null;
  ilk_kullanim_gun: string | null;
  son_kullanim_gun: string | null;
  kayit_sayisi: number;
  created_at: string;
}

export function oneriKaydiCevir(o: ApiOneriKaydi): KaynakOnerisi {
  return {
    id: o.id,
    ogrenciId: o.ogrenci_id,
    onerenId: o.oneren_id,
    onerenAd: o.oneren_ad,
    benim: o.benim,
    tur: o.tur,
    kaynakKitapId: o.kaynak_kitap_id,
    kaynakKitapAd: o.kaynak_kitap_ad,
    kaynakTestId: o.kaynak_test_id,
    kaynakTestAd: o.kaynak_test_ad,
    baglantiUrl: o.baglanti_url,
    baslik: o.baslik,
    bransKodu: o.brans_kodu,
    konuId: o.konu_id,
    konuAd: o.konu_ad,
    notMetni: o.not,
    basladi: o.basladi,
    ilkKullanimGun: o.ilk_kullanim_gun,
    sonKullanimGun: o.son_kullanim_gun,
    kayitSayisi: o.kayit_sayisi,
    olusturma: o.created_at,
  };
}

interface ApiHucreOzeti {
  basari: number | null;
  cozulen: number;
}

interface ApiKocluk {
  ogrenci_id: string;
  ogrenci_ad: string | null;
  degerlendirmeler: { degerlendirmeler: ApiDegerlendirme[]; sonraki_imlec: string | null };
  olcek_ortalamalari: {
    haftalar: (ApiOlcekler & { hafta_baslangic: string; sayi: number })[];
    toplam: ApiOlcekler & { sayi: number };
  };
  kullanilan_kaynaklar: {
    kitaplar: {
      kaynak_kitap_id: string;
      ad: string;
      brans_kodu: string;
      cozulen_test: number;
      toplam_test: number;
      cozulen_soru: number;
      kayit_sayisi: number;
      son_kullanim_gun: string;
    }[];
    serbest: { ad: string; kayit_sayisi: number; son_kullanim_gun: string }[];
    odevler: { ad: string; odev_sayisi: number; son_kullanim_gun: string }[];
  };
  oneriler: ApiOneriKaydi[];
  konu_analizi: {
    bas: string;
    bit: string;
    toplam: ApiHucreOzeti;
    bransler: {
      brans_kodu: string;
      oneriler: ApiOneri[];
      zayif_konular: {
        konu_id: string;
        konu_ad: string | null;
        ust_konu_ad: string | null;
        toplam: ApiHucreOzeti;
      }[];
    }[];
  };
  plan_odev: {
    odev: { acik: number; geciken: number; inceleme_bekleyen: number; teslim_edildi: number };
    plan: {
      durum: PlanOzeti['durum'];
      hafta_baslangic: string;
      gorev_sayisi: number;
      tamam_sayisi: number;
      soru: { gerceklesen: number; planlanan: number };
      dakika: { gerceklesen: number; planlanan: number };
    } | null;
  };
}

/** Konu ozetinde en fazla gosterilecek zayif konu (dersler arasi). */
const ZAYIF_KONU_UST = 5;

export function koclukCevir(d: ApiKocluk): Kocluk {
  const zayiflar: ZayifKonu[] = d.konu_analizi.bransler.flatMap((b) =>
    b.zayif_konular.map((k) => ({
      bransKodu: b.brans_kodu,
      konuId: k.konu_id,
      konuAd: k.konu_ad,
      ustKonuAd: k.ust_konu_ad,
      cozulen: k.toplam.cozulen,
      basari: k.toplam.basari,
    })),
  );
  // Basarisi en dusuk once; basarisi bilinmeyen sona.
  zayiflar.sort((a, b) => (a.basari ?? 2) - (b.basari ?? 2));
  const p = d.plan_odev.plan;
  return {
    ogrenciId: d.ogrenci_id,
    ogrenciAd: d.ogrenci_ad,
    degerlendirmeler: {
      degerlendirmeler: d.degerlendirmeler.degerlendirmeler.map(degerlendirmeCevir),
      sonrakiImlec: d.degerlendirmeler.sonraki_imlec,
    },
    olcekHaftalari: d.olcek_ortalamalari.haftalar.map((h) => ({
      haftaBaslangici: h.hafta_baslangic,
      sayi: h.sayi,
      ortalamalar: olcekCevir(h),
    })),
    olcekToplami: {
      sayi: d.olcek_ortalamalari.toplam.sayi,
      ortalamalar: olcekCevir(d.olcek_ortalamalari.toplam),
    },
    kullanilanKaynaklar: {
      kitaplar: d.kullanilan_kaynaklar.kitaplar.map((k) => ({
        kitapId: k.kaynak_kitap_id,
        ad: k.ad,
        bransKodu: k.brans_kodu,
        cozulenTest: k.cozulen_test,
        toplamTest: k.toplam_test,
        cozulenSoru: k.cozulen_soru,
        kayitSayisi: k.kayit_sayisi,
        sonKullanimGun: k.son_kullanim_gun,
      })),
      serbest: d.kullanilan_kaynaklar.serbest.map((s) => ({
        ad: s.ad,
        kayitSayisi: s.kayit_sayisi,
        sonKullanimGun: s.son_kullanim_gun,
      })),
      odevler: d.kullanilan_kaynaklar.odevler.map((o) => ({
        ad: o.ad,
        odevSayisi: o.odev_sayisi,
        sonKullanimGun: o.son_kullanim_gun,
      })),
    },
    oneriler: d.oneriler.map(oneriKaydiCevir),
    konuOzeti: {
      bas: d.konu_analizi.bas,
      bit: d.konu_analizi.bit,
      cozulen: d.konu_analizi.toplam.cozulen,
      basari: d.konu_analizi.toplam.basari,
      zayifKonular: zayiflar.slice(0, ZAYIF_KONU_UST),
      oneriler: d.konu_analizi.bransler.flatMap((b) => b.oneriler.map(oneriCevir)),
    },
    plan: p
      ? {
          durum: p.durum,
          haftaBaslangici: p.hafta_baslangic,
          gorevSayisi: p.gorev_sayisi,
          tamamSayisi: p.tamam_sayisi,
          soru: p.soru,
          dakika: p.dakika,
        }
      : null,
    odev: {
      acik: d.plan_odev.odev.acik,
      geciken: d.plan_odev.odev.geciken,
      teslimEdildi: d.plan_odev.odev.teslim_edildi,
      incelemeBekleyen: d.plan_odev.odev.inceleme_bekleyen,
    },
  };
}

/** Dolu olcekler govdeye girer; `temizle` verilirse bos olcek `null` (duzenlemede temizleme). */
function olcekGovdesi(
  o: Partial<Olcekler> | undefined,
  temizle: boolean,
): Partial<Record<OlcekKodu, number | null>> {
  const sonuc: Partial<Record<OlcekKodu, number | null>> = {};
  if (!o) return sonuc;
  for (const k of ['calisma_duzeni', 'derse_katilim', 'odev_disiplini', 'anlama_duzeyi'] as const) {
    const v = o[k];
    if (typeof v === 'number') sonuc[k] = v;
    else if (temizle && v === null) sonuc[k] = null;
  }
  return sonuc;
}

function oneriGovdesi(g: KaynakOneriGirdisi) {
  const ortak = {
    ...(g.konuId !== undefined ? { konu_id: g.konuId } : {}),
    ...(g.notMetni !== undefined ? { not: g.notMetni } : {}),
  };
  switch (g.tur) {
    case 'kaynak_kitap':
      return { tur: 'kaynak_kitap' as const, kaynak_kitap_id: g.kitapId, ...ortak };
    case 'kaynak_kitap_testi':
      return { tur: 'kaynak_kitap_testi' as const, kaynak_test_id: g.testId, ...ortak };
    case 'link':
      return {
        tur: 'link' as const,
        baglanti_url: g.baglantiUrl,
        baslik: g.baslik,
        ...(g.bransKodu !== undefined ? { brans_kodu: g.bransKodu } : {}),
        ...ortak,
      };
    case 'serbest':
      return {
        tur: 'serbest' as const,
        baslik: g.baslik,
        ...(g.bransKodu !== undefined ? { brans_kodu: g.bransKodu } : {}),
        ...ortak,
      };
  }
}

/** Degerlendirme, kaynak onerisi ve koclukla ilgili `ogrenme` uclarini adaptor modeline cevirir. */
export function degerlendirmeAdaptoru(b: OperasyonBagimliligi): DegerlendirmeAdapter {
  const { yetkili, veriAl } = b;

  return {
    async degerlendirmeYaz(ogrenciId, g: DegerlendirmeGirdisi) {
      const d = veriAl(
        await yetkili.POST(
          '/v1/ogrenme/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/degerlendirmeler',
          {
            params: { path: { kurum_id: b.etkinKurum(), ogrenci_id: ogrenciId } },
            body: {
              donem_baslangic: g.donemBaslangic,
              ...(g.donemBitis ? { donem_bitis: g.donemBitis } : {}),
              ...(g.bransKodu ? { brans_kodu: g.bransKodu } : {}),
              ...olcekGovdesi(g.olcekler, false),
              ...(g.yorum?.trim() ? { yorum: g.yorum.trim() } : {}),
              ogrenci_gorur: g.ogrenciGorur,
            },
          },
        ),
      );
      return degerlendirmeCevir(d);
    },

    async degerlendirmeDuzenle(id, g: DegerlendirmeGuncelleGirdisi) {
      const d = veriAl(
        await yetkili.PATCH('/v1/ogrenme/kurumlar/{kurum_id}/degerlendirmeler/{id}', {
          params: { path: { kurum_id: b.etkinKurum(), id } },
          body: {
            ...(g.donemBaslangic ? { donem_baslangic: g.donemBaslangic } : {}),
            ...(g.donemBitis ? { donem_bitis: g.donemBitis } : {}),
            ...(g.bransKodu !== undefined ? { brans_kodu: g.bransKodu } : {}),
            ...olcekGovdesi(g.olcekler, true),
            ...(g.yorum !== undefined ? { yorum: g.yorum?.trim() ? g.yorum.trim() : null } : {}),
            ...(g.ogrenciGorur !== undefined ? { ogrenci_gorur: g.ogrenciGorur } : {}),
            surum: g.surum,
          },
        }),
      );
      return degerlendirmeCevir(d);
    },

    async degerlendirmeGeriCek(id) {
      const d = veriAl(
        await yetkili.POST('/v1/ogrenme/kurumlar/{kurum_id}/degerlendirmeler/{id}/geri-cek', {
          params: { path: { kurum_id: b.etkinKurum(), id } },
          body: {} as never,
        }),
      );
      return degerlendirmeCevir(d);
    },

    async degerlendirmeler(ogrenciId, imlec, limit) {
      const d = veriAl(
        await yetkili.GET(
          '/v1/ogrenme/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/degerlendirmeler',
          {
            params: {
              path: { kurum_id: b.etkinKurum(), ogrenci_id: ogrenciId },
              query: { ...(imlec ? { imlec } : {}), ...(limit ? { limit } : {}) },
            },
          },
        ),
      );
      return {
        degerlendirmeler: d.degerlendirmeler.map(degerlendirmeCevir),
        sonrakiImlec: d.sonraki_imlec,
      };
    },

    async kocluk(ogrenciId) {
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/kocluk', {
          params: { path: { kurum_id: b.etkinKurum(), ogrenci_id: ogrenciId } },
        }),
      );
      return koclukCevir(d);
    },

    async hatirlatma() {
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/degerlendirme-hatirlatma', {
          params: { path: { kurum_id: b.etkinKurum() } },
        }),
      );
      return {
        haftaBaslangici: d.hafta_baslangic,
        ogrenciSayisi: d.ogrenci_sayisi,
        eksikSayisi: d.eksik_sayisi,
        ogrenciler: d.ogrenciler.map((o) => ({
          ogrenciId: o.ogrenci_id,
          ogrenciAd: o.ogrenci_ad,
          sonDegerlendirmeGun: o.son_degerlendirme_gun,
        })),
      };
    },

    async kaynakOner(ogrenciId, g) {
      const d = veriAl(
        await yetkili.POST(
          '/v1/ogrenme/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/kaynak-onerileri',
          {
            params: { path: { kurum_id: b.etkinKurum(), ogrenci_id: ogrenciId } },
            body: oneriGovdesi(g),
          },
        ),
      );
      return oneriKaydiCevir(d);
    },

    async kaynakOneriGeriCek(id) {
      const d = veriAl(
        await yetkili.POST('/v1/ogrenme/kurumlar/{kurum_id}/kaynak-onerileri/{id}/geri-cek', {
          params: { path: { kurum_id: b.etkinKurum(), id } },
          body: {} as never,
        }),
      );
      return oneriKaydiCevir(d);
    },

    async degerlendirmelerim(imlec) {
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/degerlendirmelerim', {
          params: { path: { kurum_id: b.etkinKurum() }, query: imlec ? { imlec } : {} },
        }),
      );
      return {
        degerlendirmeler: d.degerlendirmeler.map(ogrenciDegerlendirmesiCevir),
        sonrakiImlec: d.sonraki_imlec,
      };
    },

    async kaynakOnerilerim() {
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/kaynak-onerilerim', {
          params: { path: { kurum_id: b.etkinKurum() } },
        }),
      );
      return d.oneriler.map(oneriKaydiCevir);
    },
  };
}
