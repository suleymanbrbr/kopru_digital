import type { OperasyonBagimliligi } from './gercekOperasyon';
import type {
  BekleyenGeriBildirim,
  DersGeriBildirimleri,
  DersKaynagi,
  GeriBildirim,
  GeriBildirimDegeri,
  KayitAdapter,
  KayitDetayi,
  KayitDurumu,
  KayitSaglayici,
  KayitSatiri,
  KayitTuru,
} from './kayitTipleri';

const SAYFA_UST = 5;

interface ApiKayitSatiri {
  id: string;
  tur: KayitTuru;
  ders_id: string | null;
  grup_id: string;
  baslik: string;
  saglayici: KayitSaglayici;
  url: string;
  parola_var: boolean;
  gecerlilik_bitis_at: string | null;
  konu_id: string | null;
  durum: KayitDurumu;
  created_at: string;
  ders_baslangic_at: string | null;
  brans_kodu: string | null;
  izlendi: boolean;
  izledi_at: string | null;
  bozuk: boolean;
}

function satirCevir(k: ApiKayitSatiri): KayitSatiri {
  return {
    id: k.id,
    tur: k.tur,
    dersId: k.ders_id,
    grupId: k.grup_id,
    baslik: k.baslik,
    saglayici: k.saglayici,
    url: k.url,
    parolaVar: k.parola_var,
    gecerlilikBitis: k.gecerlilik_bitis_at,
    konuId: k.konu_id,
    durum: k.durum,
    bransKodu: k.brans_kodu,
    dersBaslangic: k.ders_baslangic_at,
    eklenme: k.created_at,
    izlendi: k.izlendi,
    izlediAt: k.izledi_at,
    bozuk: k.bozuk,
  };
}

interface ApiKaynak {
  id: string;
  tur: KayitTuru;
  ders_id: string | null;
  baslik: string;
  saglayici: KayitSaglayici;
  url: string;
  parola_var: boolean;
  gecerlilik_bitis_at: string | null;
  durum: KayitDurumu;
  izleyen_sayisi: number;
  acik_sorun_sayisi: number;
  created_at: string;
  ders_baslangic_at: string | null;
}

function kaynakCevir(k: ApiKaynak): DersKaynagi {
  return {
    id: k.id,
    tur: k.tur,
    dersId: k.ders_id,
    baslik: k.baslik,
    saglayici: k.saglayici,
    url: k.url,
    parolaVar: k.parola_var,
    gecerlilikBitis: k.gecerlilik_bitis_at,
    durum: k.durum,
    izleyenSayisi: k.izleyen_sayisi,
    acikSorunSayisi: k.acik_sorun_sayisi,
    eklenme: k.created_at,
    dersBaslangic: k.ders_baslangic_at,
  };
}

interface ApiGeriBildirim {
  ders_id: string;
  ogrenci_id: string;
  deger: GeriBildirimDegeri;
  konu_id: string | null;
  not: string | null;
  updated_at: string;
}

function geriBildirimCevir(g: ApiGeriBildirim): GeriBildirim {
  return {
    dersId: g.ders_id,
    deger: g.deger,
    konuId: g.konu_id,
    not: g.not,
    guncelleme: g.updated_at,
  };
}

/** `ders` modulunun kayit/materyal ve geri bildirim uclarini adaptor modeline ceviren gercek uygulama. */
export function kayitAdaptoru(b: OperasyonBagimliligi): KayitAdapter {
  const { yetkili, veriAl } = b;

  return {
    async kayitlarim(suzgec, imlec) {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.GET('/v1/ders/kurumlar/{kurum_id}/kayitlarim', {
          params: {
            path: { kurum_id },
            query: {
              limit: 30,
              ...(suzgec.tur ? { tur: suzgec.tur } : {}),
              ...(suzgec.bransKodu ? { brans_kodu: suzgec.bransKodu } : {}),
              ...(suzgec.baslangic ? { baslangic: suzgec.baslangic } : {}),
              ...(suzgec.bitis ? { bitis: suzgec.bitis } : {}),
              ...(imlec ? { imlec } : {}),
            },
          },
        }),
      );
      return { kayitlar: d.kayitlar.map(satirCevir), sonrakiImlec: d.sonraki_imlec };
    },

    async kayit(id): Promise<KayitDetayi> {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.GET('/v1/ders/kurumlar/{kurum_id}/kayitlarim/{id}', {
          params: { path: { kurum_id, id } },
        }),
      );
      return { ...satirCevir(d), parola: d.parola, acikSorunVar: d.acik_sorun_var };
    },

    async izledim(id) {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.POST('/v1/ders/kurumlar/{kurum_id}/kayitlarim/{id}/izledim', {
          params: { path: { kurum_id, id } },
          // Govdesiz POST: api bos JSON govdesi ister (diger adaptorlerle ayni yontem).
          body: {} as never,
        }),
      );
      return { izlediAt: d.izledi_at, ilk: d.ilk };
    },

    async sorunBildir(id, neden, aciklama) {
      const kurum_id = b.etkinKurum();
      veriAl(
        await yetkili.POST('/v1/ders/kurumlar/{kurum_id}/kayitlarim/{id}/sorunlar', {
          params: { path: { kurum_id, id } },
          body: { neden, ...(aciklama ? { aciklama } : {}) },
        }),
      );
    },

    async kaynaklar(suzgec) {
      const kurum_id = b.etkinKurum();
      const sonuc: DersKaynagi[] = [];
      let imlec: string | undefined;
      for (let s = 0; s < SAYFA_UST; s++) {
        const d = veriAl(
          await yetkili.GET('/v1/ders/kurumlar/{kurum_id}/kaynaklar', {
            params: {
              path: { kurum_id },
              query: {
                limit: 100,
                ...(suzgec.dersId ? { ders_id: suzgec.dersId } : {}),
                ...(suzgec.baslangic ? { baslangic: suzgec.baslangic } : {}),
                ...(suzgec.bitis ? { bitis: suzgec.bitis } : {}),
                ...(imlec ? { imlec } : {}),
              },
            },
          }),
        );
        sonuc.push(...d.kaynaklar.map(kaynakCevir));
        if (!d.sonraki_imlec) break;
        imlec = d.sonraki_imlec;
      }
      return sonuc;
    },

    async kaynakIzlemeleri(kaynakId) {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.GET('/v1/ders/kurumlar/{kurum_id}/kaynaklar/{id}/izlemeler', {
          params: { path: { kurum_id, id: kaynakId } },
        }),
      );
      return {
        hedefSayisi: d.hedef_sayisi,
        izleyenler: d.izleyenler.map((i) => ({
          ogrenciId: i.ogrenci_id,
          ad: i.gorunen_ad ?? '',
          izlediAt: i.izledi_at,
        })),
        izlemeyenler: d.izlemeyenler.map((i) => ({
          ogrenciId: i.ogrenci_id,
          ad: i.gorunen_ad ?? '',
        })),
      };
    },

    async kaynakEkle(dersId, linkler) {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.POST('/v1/ders/kurumlar/{kurum_id}/dersler/{id}/kaynaklar', {
          params: { path: { kurum_id, id: dersId } },
          body: {
            tur: 'kayit',
            gorunurluk: 'grup',
            linkler: linkler.map((l) => ({
              baslik: l.baslik,
              url: l.url,
              ...(l.parola ? { parola: l.parola } : {}),
              ...(l.gecerlilikBitis ? { gecerlilik_bitis_at: l.gecerlilikBitis } : {}),
            })),
          },
        }),
      );
      return d.kaynaklar.map(kaynakCevir);
    },

    async geriBildirimBekleyen() {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.GET('/v1/ders/kurumlar/{kurum_id}/geri-bildirim/bekleyen', {
          params: { path: { kurum_id } },
        }),
      );
      return d.dersler.map((x): BekleyenGeriBildirim => ({
        dersId: x.ders_id,
        bransKodu: x.brans_kodu,
        baslik: x.baslik,
        baslangic: x.baslangic_at,
        bitis: x.bitis_at,
        sonVerme: x.son_verme_at,
      }));
    },

    async geriBildirimVer(dersId, g) {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.PUT('/v1/ders/kurumlar/{kurum_id}/dersler/{id}/geri-bildirim', {
          params: { path: { kurum_id, id: dersId } },
          body: {
            deger: g.deger,
            ...(g.konuId ? { konu_id: g.konuId } : {}),
            ...(g.not ? { not: g.not } : {}),
          },
        }),
      );
      return geriBildirimCevir(d.geri_bildirim);
    },

    async dersGeriBildirimleri(dersId): Promise<DersGeriBildirimleri> {
      const kurum_id = b.etkinKurum();
      const d = veriAl(
        await yetkili.GET('/v1/ders/kurumlar/{kurum_id}/dersler/{id}/geri-bildirimler', {
          params: { path: { kurum_id, id: dersId } },
        }),
      );
      return {
        dersId: d.ders_id,
        ozet: d.ozet,
        katilimciSayisi: d.katilimci_sayisi,
        satirlar: d.geri_bildirimler.map((s) => ({
          ...geriBildirimCevir(s),
          ogrenciId: s.ogrenci_id,
          ad: s.gorunen_ad ?? '',
        })),
      };
    },
  };
}
