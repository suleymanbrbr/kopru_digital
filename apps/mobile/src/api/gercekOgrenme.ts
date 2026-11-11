import type { OperasyonBagimliligi } from './gercekOperasyon';
import type {
  BekleyenTeslim,
  Deneme,
  DenemeGelisimi,
  DenemeKurali,
  Konu,
  Odev,
  OdevOgrenciSatiri,
  OdevOzeti,
  OdevSablonu,
  OgrenciOdevi,
  OgrenmeAdapter,
  PlanDetayi,
  PlanGorevi,
} from './ogrenmeTipleri';

const SAYFA_UST = 10;

// --- Api govdeleri (snake_case) -------------------------------------------------------------

interface ApiKonu {
  id: string;
  kurum_id: string | null;
  brans_kodu: string;
  ust_id: string | null;
  seviye: Konu['seviye'];
  ad: string;
  sira: number;
  sinif_seviyesi: number | null;
  kullanimdan_kalkti: boolean;
  arsivlendi_at: string | null;
}

function konuCevir(k: ApiKonu): Konu {
  return {
    id: k.id,
    bransKodu: k.brans_kodu,
    ustId: k.ust_id,
    seviye: k.seviye,
    ad: k.ad,
    sira: k.sira,
    sinifSeviyesi: k.sinif_seviyesi,
    global: k.kurum_id === null,
    kullanimdanKalkti: k.kullanimdan_kalkti || k.arsivlendi_at !== null,
  };
}

interface ApiOgrenciOdevi {
  id: string;
  odev_id: string;
  baslik: string;
  aciklama: string | null;
  brans_kodu: string;
  konu_id: string | null;
  tur: OgrenciOdevi['tur'];
  kaynak: string | null;
  hedef_soru_sayisi: number | null;
  durum: OgrenciOdevi['durum'];
  son_teslim_at: string | null;
  yapilan_soru_sayisi: number | null;
  dogru_sayisi: number | null;
  yanlis_sayisi: number | null;
  bos_sayisi: number | null;
  ogrenci_notu: string | null;
  teslim_at: string | null;
  gec_teslim: boolean;
  inceleme_sonucu: OgrenciOdevi['incelemeSonucu'];
  inceleme_notu: string | null;
}

export function ogrenciOdeviCevir(o: ApiOgrenciOdevi): OgrenciOdevi {
  return {
    id: o.id,
    odevId: o.odev_id,
    baslik: o.baslik,
    aciklama: o.aciklama,
    bransKodu: o.brans_kodu,
    konuId: o.konu_id,
    tur: o.tur,
    kaynak: o.kaynak,
    hedefSoruSayisi: o.hedef_soru_sayisi,
    durum: o.durum,
    sonTeslim: o.son_teslim_at,
    yapilanSoru: o.yapilan_soru_sayisi,
    dogru: o.dogru_sayisi,
    yanlis: o.yanlis_sayisi,
    bos: o.bos_sayisi,
    ogrenciNotu: o.ogrenci_notu,
    teslimAt: o.teslim_at,
    gecTeslim: o.gec_teslim,
    incelemeSonucu: o.inceleme_sonucu,
    incelemeNotu: o.inceleme_notu,
  };
}

interface ApiOdev {
  id: string;
  baslik: string;
  brans_kodu: string;
  konu_id: string | null;
  tur: Odev['tur'];
  kaynak: string | null;
  hedef_turu: Odev['hedefTuru'];
  hedef_id: string;
  son_teslim_at: string | null;
  hedef_soru_sayisi: number | null;
  durum: Odev['durum'];
  atanan_sayisi: number;
}

function odevCevir(o: ApiOdev): Odev {
  return {
    id: o.id,
    baslik: o.baslik,
    bransKodu: o.brans_kodu,
    konuId: o.konu_id,
    tur: o.tur,
    kaynak: o.kaynak,
    hedefTuru: o.hedef_turu,
    hedefId: o.hedef_id,
    sonTeslim: o.son_teslim_at,
    hedefSoruSayisi: o.hedef_soru_sayisi,
    durum: o.durum,
    atananSayisi: o.atanan_sayisi,
  };
}

interface ApiOdevSatiri {
  ogrenci_odev_id: string;
  ogrenci_id: string;
  gorunen_ad: string | null;
  durum: OdevOgrenciSatiri['durum'];
  gec_teslim: boolean;
  teslim_at: string | null;
  yapilan_soru_sayisi: number | null;
  dogru_sayisi: number | null;
  yanlis_sayisi: number | null;
  bos_sayisi: number | null;
  ogrenci_notu: string | null;
  inceleme_sonucu: OdevOgrenciSatiri['incelemeSonucu'];
  inceleme_notu: string | null;
}

function odevSatiriCevir(s: ApiOdevSatiri): OdevOgrenciSatiri {
  return {
    ogrenciOdevId: s.ogrenci_odev_id,
    ogrenciId: s.ogrenci_id,
    ad: s.gorunen_ad,
    durum: s.durum,
    gecTeslim: s.gec_teslim,
    teslimAt: s.teslim_at,
    yapilanSoru: s.yapilan_soru_sayisi,
    dogru: s.dogru_sayisi,
    yanlis: s.yanlis_sayisi,
    bos: s.bos_sayisi,
    ogrenciNotu: s.ogrenci_notu,
    incelemeSonucu: s.inceleme_sonucu,
    incelemeNotu: s.inceleme_notu,
  };
}

interface ApiGorev {
  id: string;
  plan_id: string;
  ogrenci_id: string;
  hafta_baslangic: string;
  gun: string;
  brans_kodu: string;
  konu_id: string | null;
  baslik: string | null;
  hedef_turu: PlanGorevi['hedefTuru'];
  hedef_miktar: number;
  gerceklesen_miktar: number | null;
  durum: PlanGorevi['durum'];
  devreden_gorev_id: string | null;
  sira: number;
  surum: number;
}

export function gorevCevir(g: ApiGorev): PlanGorevi {
  return {
    id: g.id,
    planId: g.plan_id,
    ogrenciId: g.ogrenci_id,
    haftaBaslangic: g.hafta_baslangic,
    gun: g.gun,
    bransKodu: g.brans_kodu,
    konuId: g.konu_id,
    baslik: g.baslik,
    hedefTuru: g.hedef_turu,
    hedefMiktar: g.hedef_miktar,
    gerceklesen: g.gerceklesen_miktar,
    durum: g.durum,
    devredenGorevId: g.devreden_gorev_id,
    sira: g.sira,
    surum: g.surum,
  };
}

interface ApiPlanDetay {
  ogrenci_id: string;
  hafta_baslangic: string;
  kilitli: boolean;
  plan: {
    id: string;
    durum: 'taslak' | 'yayinda';
    not: string | null;
    surum: number;
  } | null;
  gorevler: ApiGorev[];
}

function planDetayCevir(p: ApiPlanDetay): PlanDetayi {
  return {
    ogrenciId: p.ogrenci_id,
    haftaBaslangic: p.hafta_baslangic,
    kilitli: p.kilitli,
    plan: p.plan
      ? { id: p.plan.id, durum: p.plan.durum, not: p.plan.not, surum: p.plan.surum }
      : null,
    gorevler: p.gorevler.map(gorevCevir),
  };
}

interface ApiDeneme {
  id: string;
  ogrenci_id: string;
  gorunen_ad: string | null;
  kural_kodu: string;
  yanlis_katsayisi: number;
  ad: string;
  yayinevi: string | null;
  sinav_tarihi: string;
  toplam_net: number;
  kaynak: 'ogrenci' | 'ogretmen';
  onay_durumu: Deneme['onayDurumu'];
  red_nedeni: string | null;
  bolumler: {
    bolum_kodu: string;
    brans_kodu: string;
    soru_sayisi: number;
    dogru: number;
    yanlis: number;
    bos: number;
    net: number;
  }[];
}

function denemeCevir(d: ApiDeneme): Deneme {
  return {
    id: d.id,
    ogrenciId: d.ogrenci_id,
    ogrenciAd: d.gorunen_ad,
    kuralKodu: d.kural_kodu,
    yanlisKatsayisi: d.yanlis_katsayisi,
    ad: d.ad,
    yayinevi: d.yayinevi,
    sinavTarihi: d.sinav_tarihi,
    toplamNet: d.toplam_net,
    kaynak: d.kaynak,
    onayDurumu: d.onay_durumu,
    redNedeni: d.red_nedeni,
    bolumler: d.bolumler.map((b) => ({
      bolumKodu: b.bolum_kodu,
      bransKodu: b.brans_kodu,
      soruSayisi: b.soru_sayisi,
      dogru: b.dogru,
      yanlis: b.yanlis,
      bos: b.bos,
      net: b.net,
    })),
  };
}

/** `konular` / `odevlerim` gibi imlecli uclarin tum sayfalarini (en cok `SAYFA_UST`) toplar. */
async function sayfalariTopla<T>(
  getir: (imlec: string | undefined) => Promise<{ liste: T[]; sonraki: string | null }>,
): Promise<T[]> {
  const sonuc: T[] = [];
  let imlec: string | undefined;
  for (let s = 0; s < SAYFA_UST; s++) {
    const d = await getir(imlec);
    sonuc.push(...d.liste);
    if (!d.sonraki) break;
    imlec = d.sonraki;
  }
  return sonuc;
}

/** Mufredat, odev, haftalik plan ve deneme uclarini adaptor modeline ceviren gercek uygulama. */
export function ogrenmeAdaptoru(b: OperasyonBagimliligi): OgrenmeAdapter {
  const { yetkili, veriAl } = b;

  /** Govdesiz basarili yanit (204 vb.) hata degildir; hata yaniti `veriAl` ile firlatilir. */
  function bosAl(sonuc: { data?: unknown; error?: unknown; response: Response }): void {
    if (sonuc.response.ok) return;
    veriAl({ error: sonuc.error, response: sonuc.response });
  }

  const adaptor: OgrenmeAdapter = {
    // --- Mufredat ---
    konular: () =>
      sayfalariTopla(async (imlec) => {
        const d = veriAl(
          await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/konular', {
            params: {
              path: { kurum_id: b.etkinKurum() },
              query: { tumu: '1', limit: 500, ...(imlec ? { imlec } : {}) },
            },
          }),
        );
        return { liste: d.konular.map(konuCevir), sonraki: d.sonraki_imlec };
      }),

    // --- Odev (ogrenci) ---
    odevlerim: () =>
      sayfalariTopla(async (imlec) => {
        const d = veriAl(
          await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/odevlerim', {
            params: {
              path: { kurum_id: b.etkinKurum() },
              query: { limit: 100, ...(imlec ? { imlec } : {}) },
            },
          }),
        );
        return { liste: d.odevler.map(ogrenciOdeviCevir), sonraki: d.sonraki_imlec };
      }),

    async odevTeslim(id, g) {
      const d = veriAl(
        await yetkili.POST('/v1/ogrenme/kurumlar/{kurum_id}/ogrenci-odevleri/{id}/teslim', {
          params: { path: { kurum_id: b.etkinKurum(), id } },
          body: {
            yapilan_soru_sayisi: g.yapilanSoru,
            ...(g.dogru !== undefined ? { dogru_sayisi: g.dogru } : {}),
            ...(g.yanlis !== undefined ? { yanlis_sayisi: g.yanlis } : {}),
            ...(g.bos !== undefined ? { bos_sayisi: g.bos } : {}),
            ...(g.not ? { ogrenci_notu: g.not } : {}),
          },
        }),
      );
      return ogrenciOdeviCevir(d);
    },

    // --- Odev (ogretmen) ---
    odevler: () =>
      sayfalariTopla(async (imlec) => {
        const d = veriAl(
          await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/odevler', {
            params: {
              path: { kurum_id: b.etkinKurum() },
              query: { limit: 100, ...(imlec ? { imlec } : {}) },
            },
          }),
        );
        return { liste: d.odevler.map(odevCevir), sonraki: d.sonraki_imlec };
      }),

    async odevVer(g) {
      const kurum_id = b.etkinKurum();
      // Taslak olusturulur, hemen yayinlanir (fan-out sunucuda); yayin basarisizsa taslak kalir.
      const taslak = veriAl(
        await yetkili.POST('/v1/ogrenme/kurumlar/{kurum_id}/odevler', {
          params: { path: { kurum_id } },
          body: {
            baslik: g.baslik,
            brans_kodu: g.bransKodu,
            ...(g.konuId ? { konu_id: g.konuId } : {}),
            tur: g.tur,
            ...(g.kaynak ? { kaynak: g.kaynak } : {}),
            hedef_turu: g.hedefTuru,
            hedef_id: g.hedefId,
            son_teslim_at: g.sonTeslim,
            ...(g.hedefSoruSayisi ? { hedef_soru_sayisi: g.hedefSoruSayisi } : {}),
            fotograf_gerekli: false,
          },
        }),
      );
      const yayin = veriAl(
        await yetkili.POST('/v1/ogrenme/kurumlar/{kurum_id}/odevler/{id}/yayinla', {
          params: { path: { kurum_id, id: taslak.id } },
          body: {} as never,
        }),
      );
      return odevCevir(yayin);
    },

    async odevOzeti(id) {
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/odevler/{id}/ozet', {
          params: { path: { kurum_id: b.etkinKurum(), id } },
        }),
      );
      const s = d.sayilar;
      return {
        odev: odevCevir(d.odev),
        sayilar: {
          atanan: s.atanan,
          atandi: s.atandi,
          teslimEdildi: s.teslim_edildi,
          incelendi: s.incelendi,
          tekrarIstendi: s.tekrar_istendi,
          gecTeslim: s.gec_teslim,
          ortalamaDogruOrani: s.ortalama_dogru_orani,
        },
        ogrenciler: (d.ogrenciler as unknown as ApiOdevSatiri[]).map(odevSatiriCevir),
      } satisfies OdevOzeti;
    },

    async odevIncele(id, sonuc, not) {
      const d = veriAl(
        await yetkili.POST('/v1/ogrenme/kurumlar/{kurum_id}/ogrenci-odevleri/{id}/inceleme', {
          params: { path: { kurum_id: b.etkinKurum(), id } },
          body: { sonuc, ...(not ? { not } : {}) },
        }),
      );
      const o = ogrenciOdeviCevir(d);
      return {
        ogrenciOdevId: o.id,
        ogrenciId: '',
        ad: null,
        durum: o.durum,
        gecTeslim: o.gecTeslim,
        teslimAt: o.teslimAt,
        yapilanSoru: o.yapilanSoru,
        dogru: o.dogru,
        yanlis: o.yanlis,
        bos: o.bos,
        ogrenciNotu: o.ogrenciNotu,
        incelemeSonucu: o.incelemeSonucu,
        incelemeNotu: o.incelemeNotu,
      };
    },

    async odevSablonlari(): Promise<OdevSablonu[]> {
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/odev-sablonlari', {
          params: { path: { kurum_id: b.etkinKurum() } },
        }),
      );
      return d.sablonlar.map((s) => ({
        id: s.id,
        baslik: s.baslik,
        bransKodu: s.brans_kodu,
        konuId: s.konu_id,
        tur: s.tur,
        kaynak: s.kaynak,
        hedefSoruSayisi: s.hedef_soru_sayisi,
      }));
    },

    /** `GET /teslimler?durum=teslim_edildi`: teslim zamanina gore eskiden yeniye (tum sayfalar). */
    incelemeBekleyenler: () =>
      sayfalariTopla(async (imlec) => {
        const d = veriAl(
          await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/teslimler', {
            params: {
              path: { kurum_id: b.etkinKurum() },
              query: { durum: 'teslim_edildi', limit: 100, ...(imlec ? { imlec } : {}) },
            },
          }),
        );
        return {
          liste: d.teslimler.map((t): BekleyenTeslim => ({
            odevId: t.odev_id,
            odevBaslik: t.odev_baslik,
            ogrenciOdevId: t.ogrenci_odev_id,
            ad: t.gorunen_ad,
            teslimAt: t.teslim_at,
            gecTeslim: t.gec_teslim,
          })),
          sonraki: d.sonraki_imlec,
        };
      }),

    // --- Plan (ogrenci) ---
    async planim(hafta) {
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/planim', {
          params: { path: { kurum_id: b.etkinKurum() }, query: { hafta } },
        }),
      );
      return planDetayCevir(d);
    },

    async gorevlerim(gun) {
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/gorevlerim', {
          params: { path: { kurum_id: b.etkinKurum() }, query: { gun } },
        }),
      );
      return { gun: d.gun, gorevler: d.gorevler.map((g) => gorevCevir(g as unknown as ApiGorev)) };
    },

    async gorevGerceklesen(id, miktar) {
      const d = veriAl(
        await yetkili.PUT('/v1/ogrenme/kurumlar/{kurum_id}/gorevler/{id}/gerceklesen', {
          params: { path: { kurum_id: b.etkinKurum(), id } },
          // `surum` bilerek yok: ayni deger tekrari guvenli, eski surum 409 vermez.
          body: { gerceklesen_miktar: miktar },
        }),
      );
      return gorevCevir(d);
    },

    async gorevDevret(id, hedefGun) {
      const d = veriAl(
        await yetkili.POST('/v1/ogrenme/kurumlar/{kurum_id}/gorevler/{id}/devret', {
          params: { path: { kurum_id: b.etkinKurum(), id } },
          body: hedefGun ? { hedef_gun: hedefGun } : {},
        }),
      );
      return {
        eski: gorevCevir(d.eski),
        yeni: gorevCevir(d.yeni),
      };
    },

    // --- Plan (ogretmen) ---
    async ogrenciPlani(ogrenciId, hafta) {
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/ogrenciler/{ogrenci_id}/plan', {
          params: { path: { kurum_id: b.etkinKurum(), ogrenci_id: ogrenciId }, query: { hafta } },
        }),
      );
      return planDetayCevir(d);
    },

    async planOlustur(ogrenciId, haftaBaslangic) {
      const d = veriAl(
        await yetkili.POST('/v1/ogrenme/kurumlar/{kurum_id}/planlar', {
          params: { path: { kurum_id: b.etkinKurum() } },
          body: { ogrenci_id: ogrenciId, hafta_baslangic: haftaBaslangic },
        }),
      );
      return planDetayCevir(d);
    },

    async gorevEkle(planId, g) {
      const d = veriAl(
        await yetkili.POST('/v1/ogrenme/kurumlar/{kurum_id}/planlar/{id}/gorevler', {
          params: { path: { kurum_id: b.etkinKurum(), id: planId } },
          body: {
            gun: g.gun,
            brans_kodu: g.bransKodu,
            ...(g.konuId ? { konu_id: g.konuId } : {}),
            ...(g.baslik ? { baslik: g.baslik } : {}),
            hedef_turu: g.hedefTuru,
            hedef_miktar: g.hedefMiktar,
            sira: 0,
          },
        }),
      );
      return gorevCevir(d);
    },

    async gorevGuncelle(id, g) {
      const d = veriAl(
        await yetkili.PATCH('/v1/ogrenme/kurumlar/{kurum_id}/gorevler/{id}', {
          params: { path: { kurum_id: b.etkinKurum(), id } },
          body: {
            ...(g.gun ? { gun: g.gun } : {}),
            ...(g.hedefTuru ? { hedef_turu: g.hedefTuru } : {}),
            ...(g.hedefMiktar ? { hedef_miktar: g.hedefMiktar } : {}),
            ...(g.baslik !== undefined ? { baslik: g.baslik } : {}),
            ...(g.surum ? { surum: g.surum } : {}),
          },
        }),
      );
      return gorevCevir(d);
    },

    async gorevSil(id) {
      bosAl(
        await yetkili.DELETE('/v1/ogrenme/kurumlar/{kurum_id}/gorevler/{id}', {
          params: { path: { kurum_id: b.etkinKurum(), id } },
        }),
      );
    },

    async planYayinla(planId) {
      const d = veriAl(
        await yetkili.POST('/v1/ogrenme/kurumlar/{kurum_id}/planlar/{id}/yayinla', {
          params: { path: { kurum_id: b.etkinKurum(), id: planId } },
          body: {} as never,
        }),
      );
      return planDetayCevir(d);
    },

    // --- Deneme ---
    async denemeKurallari(): Promise<DenemeKurali[]> {
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/deneme-kurallari', {
          params: { path: { kurum_id: b.etkinKurum() }, query: { aktif: 'true' } },
        }),
      );
      return d.kurallar.map((k) => ({
        id: k.id,
        kod: k.kod,
        ad: k.ad,
        yanlisKatsayisi: k.yanlis_katsayisi,
        toplamSoruSayisi: k.toplam_soru_sayisi,
        bolumler: k.bolumler.map((x) => ({
          bolumKodu: x.bolum_kodu,
          bransKodu: x.brans_kodu,
          ad: x.ad,
          soruSayisi: x.soru_sayisi,
        })),
      }));
    },

    async ogrenciDenemeGirisi() {
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/deneme-ayarlari', {
          params: { path: { kurum_id: b.etkinKurum() } },
        }),
      );
      return d.ogrenci_deneme_girisi;
    },

    denemelerim: () =>
      sayfalariTopla(async (imlec) => {
        const d = veriAl(
          await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/denemelerim', {
            params: {
              path: { kurum_id: b.etkinKurum() },
              query: { limit: 100, ...(imlec ? { imlec } : {}) },
            },
          }),
        );
        return {
          liste: (d.denemeler as unknown as ApiDeneme[]).map(denemeCevir),
          sonraki: d.sonraki_imlec,
        };
      }),

    async denemeOlustur(g) {
      const d = veriAl(
        await yetkili.POST('/v1/ogrenme/kurumlar/{kurum_id}/denemeler', {
          params: { path: { kurum_id: b.etkinKurum() } },
          body: {
            kural_kodu: g.kuralKodu,
            ...(g.ogrenciId ? { ogrenci_id: g.ogrenciId } : {}),
            ad: g.ad,
            ...(g.yayinevi ? { yayinevi: g.yayinevi } : {}),
            sinav_tarihi: g.sinavTarihi,
            bolumler: g.bolumler.map((x) => ({
              bolum_kodu: x.bolumKodu,
              dogru: x.dogru,
              yanlis: x.yanlis,
              ...(x.bos !== undefined ? { bos: x.bos } : {}),
            })),
          },
        }),
      );
      return denemeCevir(d);
    },

    denemeler: (s) =>
      sayfalariTopla(async (imlec) => {
        const d = veriAl(
          await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/denemeler', {
            params: {
              path: { kurum_id: b.etkinKurum() },
              query: {
                limit: 100,
                ...(s.onay ? { onay: s.onay } : {}),
                ...(s.ogrenciId ? { ogrenci_id: s.ogrenciId } : {}),
                ...(imlec ? { imlec } : {}),
              },
            },
          }),
        );
        return {
          liste: (d.denemeler as unknown as ApiDeneme[]).map(denemeCevir),
          sonraki: d.sonraki_imlec,
        };
      }),

    async denemeOnayla(id) {
      veriAl(
        await yetkili.POST('/v1/ogrenme/kurumlar/{kurum_id}/denemeler/{id}/onay', {
          params: { path: { kurum_id: b.etkinKurum(), id } },
          body: {} as never,
        }),
      );
    },

    async denemeReddet(id, nedeni) {
      veriAl(
        await yetkili.POST('/v1/ogrenme/kurumlar/{kurum_id}/denemeler/{id}/red', {
          params: { path: { kurum_id: b.etkinKurum(), id } },
          body: { red_nedeni: nedeni },
        }),
      );
    },

    async denemeGelisim(ogrenciId, kuralKodu): Promise<DenemeGelisimi> {
      const d = veriAl(
        await yetkili.GET('/v1/ogrenme/kurumlar/{kurum_id}/ogrenciler/{id}/deneme-gelisim', {
          params: {
            path: { kurum_id: b.etkinKurum(), id: ogrenciId },
            query: { kural: kuralKodu, limit: 20 },
          },
        }),
      );
      return {
        ogrenciId: d.ogrenci_id,
        kuralKodu: d.kural_kodu,
        denemeSayisi: d.deneme_sayisi,
        noktalar: d.noktalar.map((n) => ({
          denemeId: n.deneme_id,
          ad: n.ad,
          sinavTarihi: n.sinav_tarihi,
          toplamNet: n.toplam_net,
          bolumler: n.bolumler.map((x) => ({
            bolumKodu: x.bolum_kodu,
            bransKodu: x.brans_kodu,
            net: x.net,
          })),
        })),
        son5Ortalama: d.son5_ortalama,
        onceki5Ortalama: d.onceki5_ortalama,
        degisim: d.degisim,
        bolumGelisimi: d.bolum_gelisimi.map((x) => ({
          bolumKodu: x.bolum_kodu,
          bransKodu: x.brans_kodu,
          son5Ortalama: x.son5_ortalama,
          degisim: x.degisim,
        })),
      };
    },
  };
  return adaptor;
}
