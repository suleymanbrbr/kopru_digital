import { baglantiyiCoz } from '../kayit/saglayici';
import { yerelTarih } from '../lib/saat';
import type {
  BekleyenGeriBildirim,
  DersKaynagi,
  GeriBildirim,
  GeriBildirimDegeri,
  KayitAdapter,
  KayitDurumu,
  KayitSaglayici,
  KayitSatiri,
  KayitTuru,
  SorunNedeni,
} from './kayitTipleri';
import {
  MOCK_SAAT_DILIMI,
  type MockOperasyonOkuma,
  type MockOperasyonSecenekleri,
} from './mockOperasyon';
import { ApiHata } from './tipler';

interface MockKaynak {
  id: string;
  tur: KayitTuru;
  dersId: string | null;
  grupId: string;
  baslik: string;
  saglayici: KayitSaglayici;
  url: string;
  parola: string | null;
  gecerlilikBitis: string | null;
  durum: KayitDurumu;
  eklenme: string;
}

interface MockGeriBildirim extends GeriBildirim {
  ogrenciId: string;
}

const SAAT = 3_600_000;
const SAYFA = 30;
const PENCERE_MS = 24 * SAAT;

/** Backend olmadan calisan kayit/materyal ve geri bildirim adaptoru. */
export function mockKayit(sec: MockOperasyonSecenekleri, okuma: MockOperasyonOkuma): KayitAdapter {
  const simdi = sec.simdi ?? (() => Date.now());
  const tz = MOCK_SAAT_DILIMI;
  let sayac = 0;
  const yeniId = (on: string) => `${on}-${String(++sayac)}`;

  const dersBul = (id: string) => okuma.dersler().find((d) => d.id === id);
  const ilkDers = (grupId: string, siraNo: number) =>
    okuma
      .dersler()
      .filter((d) => d.grupId === grupId)
      .sort((a, b) => Date.parse(a.baslangic) - Date.parse(b.baslangic))[siraNo];

  const g8a = 'g-8a';
  const denklem = ilkDers(g8a, 0);
  const uslu = ilkDers(g8a, 1);
  const bugunIso = new Date(simdi() - 20 * SAAT).toISOString();

  const kaynaklar: MockKaynak[] = [
    ...(denklem
      ? [
          {
            id: 'kaynak-zoom-denklem',
            tur: 'kayit' as const,
            dersId: denklem.id,
            grupId: g8a,
            baslik: 'Denklemler kaydı',
            saglayici: 'zoom' as const,
            url: 'https://us02web.zoom.us/rec/share/mock-denklemler',
            parola: 'x7Kq2!mR',
            gecerlilikBitis: new Date(simdi() + 20 * 24 * SAAT).toISOString(),
            durum: 'aktif' as const,
            eklenme: bugunIso,
          },
        ]
      : []),
    ...(uslu
      ? [
          {
            id: 'kaynak-drive-uslu',
            tur: 'kayit' as const,
            dersId: uslu.id,
            grupId: g8a,
            baslik: 'Üslü sayılar kaydı',
            saglayici: 'drive' as const,
            url: 'https://drive.google.com/file/d/mock-uslu/view',
            parola: null,
            gecerlilikBitis: null,
            durum: 'aktif' as const,
            eklenme: bugunIso,
          },
        ]
      : []),
    {
      id: 'kaynak-youtube-materyal',
      tur: 'materyal',
      dersId: null,
      grupId: g8a,
      baslik: 'Üslü sayılar konu anlatımı',
      saglayici: 'youtube',
      url: 'https://www.youtube.com/watch?v=mock-uslu',
      parola: null,
      gecerlilikBitis: null,
      durum: 'aktif',
      eklenme: new Date(simdi() - 3 * 24 * SAAT).toISOString(),
    },
  ];
  /** `${kaynakId}:${ogrenciId}` -> izlenme ani. */
  const izlemeler = new Map<string, string>();
  /** Acik "acilmiyor" bildirimleri: `${kaynakId}:${ogrenciId}`. */
  const sorunlar = new Set<string>();
  const geriBildirimler = new Map<string, MockGeriBildirim>();

  async function gecik(ms = sec.gecikmeMs) {
    await sec.bekle(ms);
    await sec.oturumGerekli();
  }

  function ben(): string {
    const id = sec.aktifUyelikId();
    if (!id?.startsWith('uyelik-ogrenci')) throw new ApiHata('izin_yok', undefined, { durum: 403 });
    return id;
  }

  function gorunenKaynakMi(k: MockKaynak, ogrenciId: string) {
    return k.durum !== 'gizli' && okuma.grupUyeleri(k.grupId).includes(ogrenciId);
  }

  function dersBilgisi(k: MockKaynak) {
    const d = k.dersId ? dersBul(k.dersId) : undefined;
    return { dersBaslangic: d?.baslangic ?? null, bransKodu: d?.bransKodu ?? null };
  }

  function satir(k: MockKaynak, ogrenciId: string): KayitSatiri {
    const izlediAt = izlemeler.get(`${k.id}:${ogrenciId}`) ?? null;
    return {
      id: k.id,
      tur: k.tur,
      dersId: k.dersId,
      grupId: k.grupId,
      baslik: k.baslik,
      saglayici: k.saglayici,
      url: k.url,
      parolaVar: k.parola !== null,
      gecerlilikBitis: k.gecerlilikBitis,
      konuId: null,
      durum: k.durum,
      ...dersBilgisi(k),
      eklenme: k.eklenme,
      izlendi: izlediAt !== null,
      izlediAt,
      bozuk: k.durum === 'bozuk',
    };
  }

  function kaynakCevir(k: MockKaynak): DersKaynagi {
    const hedef = okuma.grupUyeleri(k.grupId);
    return {
      id: k.id,
      tur: k.tur,
      dersId: k.dersId,
      baslik: k.baslik,
      saglayici: k.saglayici,
      url: k.url,
      parolaVar: k.parola !== null,
      gecerlilikBitis: k.gecerlilikBitis,
      durum: k.durum,
      izleyenSayisi: hedef.filter((o) => izlemeler.has(`${k.id}:${o}`)).length,
      acikSorunSayisi: hedef.filter((o) => sorunlar.has(`${k.id}:${o}`)).length,
      eklenme: k.eklenme,
      dersBaslangic: dersBilgisi(k).dersBaslangic,
    };
  }

  function gunBilgisi(s: KayitSatiri) {
    return yerelTarih(s.dersBaslangic ?? s.eklenme, tz);
  }

  function geriBildirimOzeti(dersId: string) {
    const liste = [...geriBildirimler.values()].filter((g) => g.dersId === dersId);
    const say = (d: GeriBildirimDegeri) => liste.filter((g) => g.deger === d).length;
    return {
      liste,
      ozet: {
        anladim: say('anladim'),
        kismen: say('kismen'),
        anlamadim: say('anlamadim'),
        toplam: liste.length,
      },
    };
  }

  return {
    async kayitlarim(suzgec, imlec) {
      await gecik();
      const o = ben();
      const bas = suzgec.baslangic;
      const bit = suzgec.bitis;
      const hepsi = kaynaklar
        .filter((k) => gorunenKaynakMi(k, o))
        .map((k) => satir(k, o))
        .filter(
          (s) =>
            (!suzgec.tur || s.tur === suzgec.tur) &&
            (!suzgec.bransKodu || s.bransKodu === suzgec.bransKodu) &&
            (!bas || gunBilgisi(s) >= bas) &&
            (!bit || gunBilgisi(s) <= bit),
        )
        // Izlenmemisler once, sonra yeni -> eski.
        .sort(
          (a, b) =>
            Number(a.izlendi) - Number(b.izlendi) ||
            Date.parse(b.dersBaslangic ?? b.eklenme) - Date.parse(a.dersBaslangic ?? a.eklenme),
        );
      const bas0 = imlec ? Number(imlec) : 0;
      const dilim = hepsi.slice(bas0, bas0 + SAYFA);
      return {
        kayitlar: dilim,
        sonrakiImlec: bas0 + SAYFA < hepsi.length ? String(bas0 + SAYFA) : null,
      };
    },

    async kayit(id) {
      await gecik();
      const o = ben();
      const k = kaynaklar.find((x) => x.id === id);
      if (!k || !gorunenKaynakMi(k, o)) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      return { ...satir(k, o), parola: k.parola, acikSorunVar: sorunlar.has(`${k.id}:${o}`) };
    },

    async izledim(id) {
      await gecik(sec.gecikmeMs / 2);
      const o = ben();
      const k = kaynaklar.find((x) => x.id === id);
      if (!k || !gorunenKaynakMi(k, o)) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      const mevcut = izlemeler.get(`${id}:${o}`);
      if (mevcut) return { izlediAt: mevcut, ilk: false };
      const at = new Date(simdi()).toISOString();
      izlemeler.set(`${id}:${o}`, at);
      return { izlediAt: at, ilk: true };
    },

    async sorunBildir(id, _neden: SorunNedeni) {
      await gecik(sec.gecikmeMs / 2);
      const o = ben();
      const k = kaynaklar.find((x) => x.id === id);
      if (!k || !gorunenKaynakMi(k, o)) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      if (sorunlar.has(`${id}:${o}`)) {
        throw new ApiHata('cakisma', undefined, { durum: 409, ayrinti: 'kaynak_sorun_zaten_acik' });
      }
      sorunlar.add(`${id}:${o}`);
      if (k.durum === 'aktif') k.durum = 'bozuk';
    },

    async kaynaklar(suzgec) {
      await gecik();
      return kaynaklar
        .filter((k) => {
          if (suzgec.dersId && k.dersId !== suzgec.dersId) return false;
          const gun = yerelTarih(dersBilgisi(k).dersBaslangic ?? k.eklenme, tz);
          return (
            (!suzgec.baslangic || gun >= suzgec.baslangic) && (!suzgec.bitis || gun <= suzgec.bitis)
          );
        })
        .map(kaynakCevir);
    },

    async kaynakIzlemeleri(kaynakId) {
      await gecik();
      const k = kaynaklar.find((x) => x.id === kaynakId);
      if (!k) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      const hedef = okuma.grupUyeleri(k.grupId);
      return {
        hedefSayisi: hedef.length,
        izleyenler: hedef
          .filter((o) => izlemeler.has(`${k.id}:${o}`))
          .map((o) => ({
            ogrenciId: o,
            ad: okuma.ogrenciAdi(o),
            izlediAt: izlemeler.get(`${k.id}:${o}`) ?? '',
          })),
        izlemeyenler: hedef
          .filter((o) => !izlemeler.has(`${k.id}:${o}`))
          .map((o) => ({ ogrenciId: o, ad: okuma.ogrenciAdi(o) })),
      };
    },

    async kaynakEkle(dersId, linkler) {
      await gecik();
      const d = dersBul(dersId);
      if (!d) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      const hazir = linkler.map((l) => {
        const c = baglantiyiCoz(l.url);
        if (!c.gecerli) {
          throw new ApiHata('dogrulama', undefined, { durum: 422, ayrinti: 'kaynak_url_gecersiz' });
        }
        if (l.gecerlilikBitis && Date.parse(l.gecerlilikBitis) <= simdi()) {
          throw new ApiHata('dogrulama', undefined, {
            durum: 422,
            ayrinti: 'kaynak_suresi_gecmis',
          });
        }
        return { l, c };
      });
      const yeni = hazir.map(({ l, c }): MockKaynak => ({
        id: yeniId('kaynak'),
        tur: 'kayit',
        dersId,
        grupId: d.grupId,
        baslik: l.baslik,
        saglayici: c.saglayici,
        url: c.url,
        parola: l.parola ?? null,
        gecerlilikBitis: l.gecerlilikBitis ?? null,
        durum: 'aktif',
        eklenme: new Date(simdi()).toISOString(),
      }));
      kaynaklar.push(...yeni);
      return yeni.map(kaynakCevir);
    },

    async geriBildirimBekleyen() {
      await gecik();
      const o = ben();
      const t = simdi();
      return okuma
        .dersler()
        .filter((d) => {
          const y = okuma.yoklama(d.id, o);
          return (
            d.katilimcilar.includes(o) &&
            d.durum !== 'iptal' &&
            Date.parse(d.bitis) <= t &&
            Date.parse(d.bitis) > t - PENCERE_MS &&
            y !== 'gelmedi' &&
            y !== 'izinli' &&
            !geriBildirimler.has(`${d.id}:${o}`)
          );
        })
        .sort((a, b) => Date.parse(b.bitis) - Date.parse(a.bitis))
        .map((d): BekleyenGeriBildirim => ({
          dersId: d.id,
          bransKodu: d.bransKodu,
          baslik: d.baslik,
          baslangic: d.baslangic,
          bitis: d.bitis,
          sonVerme: new Date(Date.parse(d.bitis) + PENCERE_MS).toISOString(),
        }));
    },

    async geriBildirimVer(dersId, g) {
      await gecik();
      const o = ben();
      const d = dersBul(dersId);
      if (!d?.katilimcilar.includes(o)) {
        throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      }
      if (Date.parse(d.bitis) > simdi()) {
        throw new ApiHata('dogrulama', undefined, {
          durum: 422,
          ayrinti: 'geri_bildirim_ders_bitmedi',
        });
      }
      const y = okuma.yoklama(d.id, o);
      if (y === 'gelmedi' || y === 'izinli') {
        throw new ApiHata('dogrulama', undefined, {
          durum: 422,
          ayrinti: 'geri_bildirim_yoklama_uygun_degil',
        });
      }
      const anahtar = `${dersId}:${o}`;
      if (geriBildirimler.has(anahtar) && simdi() > Date.parse(d.bitis) + PENCERE_MS) {
        throw new ApiHata('dogrulama', undefined, {
          durum: 422,
          ayrinti: 'geri_bildirim_guncelleme_suresi_doldu',
        });
      }
      const kayit: MockGeriBildirim = {
        dersId,
        ogrenciId: o,
        deger: g.deger,
        konuId: g.konuId ?? null,
        not: g.not ?? null,
        guncelleme: new Date(simdi()).toISOString(),
      };
      geriBildirimler.set(anahtar, kayit);
      return kayit;
    },

    async dersGeriBildirimleri(dersId) {
      await gecik();
      const d = dersBul(dersId);
      if (!d) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      const { liste, ozet } = geriBildirimOzeti(dersId);
      return {
        dersId,
        ozet,
        katilimciSayisi: d.katilimcilar.length,
        satirlar: liste.map((g) => ({ ...g, ad: okuma.ogrenciAdi(g.ogrenciId) })),
      };
    },
  };
}
