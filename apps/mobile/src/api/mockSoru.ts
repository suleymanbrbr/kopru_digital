import type { MockOperasyonSecenekleri } from './mockOperasyon';
import type {
  EkGirdisi,
  Musaitlik,
  OkumaAdresi,
  SoruAdapter,
  SoruDetayi,
  SoruEki,
  SoruKotasi,
  SoruMesaji,
  SoruOzeti,
  SoruSayfasi,
} from './soruTipleri';
import { ApiHata } from './tipler';

const SAAT = 3_600_000;
const GUNLUK_LIMIT = 3;
const TAKIP_LIMITI = 3;

interface MockSoru extends Omit<SoruDetayi, 'kalanTakipHakki' | 'fotograflar' | 'mesajlar'> {
  istekId: string | null;
  fotoIdleri: string[];
  mesajlar: SoruMesaji[];
  takipSayisi: number;
}

/** `mock://` adresleri arayuzde yerel bir gorsele cevrilir (`soru/gorsel.ts`). */
export const mockAdres = (ad: string, tur: 'gorsel' | 'ses' = 'gorsel'): OkumaAdresi => ({
  mimeTipi: tur === 'ses' ? 'audio/mp4' : 'image/jpeg',
  asilUrl: `mock://${tur}/${ad}`,
  kucukUrl: null,
  ortaUrl: null,
  genislik: tur === 'ses' ? null : 1200,
  yukseklik: tur === 'ses' ? null : 1600,
  sureSn: tur === 'ses' ? 42 : null,
  bitis: new Date(Date.now() + 10 * 60_000).toISOString(),
});

/** Backend olmadan calisan "soru sor" adaptoru. Ogrenci ve ogretmen ayni bellek ici depoyu paylasir. */
export function mockSoru(sec: MockOperasyonSecenekleri): SoruAdapter {
  const simdi = sec.simdi ?? (() => Date.now());
  let sayac = 0;
  const yeniId = (on: string) => `${on}-${String(++sayac)}`;
  const kopya = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  let musait: Musaitlik = { musait: true, musaitDegilTarihi: null };

  const DENIZ = 'uyelik-ogrenci-a';
  const ogrenciKimligi = () => {
    const id = sec.aktifUyelikId();
    return id?.startsWith('uyelik-ogrenci') ? id : null;
  };
  function ogrenciOlmali(): string {
    const id = ogrenciKimligi();
    if (!id) throw new ApiHata('izin_yok', undefined, { durum: 403 });
    return id;
  }
  function personelOlmali() {
    if (ogrenciKimligi()) throw new ApiHata('izin_yok', undefined, { durum: 403 });
  }
  const bulunamadi = () => new ApiHata('bulunamadi', undefined, { durum: 404 });
  const durumHatasi = () =>
    new ApiHata('cakisma', undefined, { durum: 409, ayrinti: 'soru_durumu_gecersiz' });
  async function gecik() {
    await sec.bekle(sec.gecikmeMs);
    await sec.oturumGerekli();
  }

  const t0 = simdi();
  const mesaj = (
    tur: SoruMesaji['tur'],
    yazarId: string,
    rol: SoruMesaji['yazarRolu'],
    ad: string,
    metin: string | null,
    at: number,
    ekler: SoruEki[] = [],
    dersteKonusalim = false,
  ): SoruMesaji => ({
    id: yeniId('msj'),
    yazarId,
    yazarAdi: ad,
    yazarRolu: rol,
    tur,
    metin,
    dersteKonusalim,
    sira: 0,
    olusturma: new Date(at).toISOString(),
    ekler,
  });
  const ek = (tur: SoruEki['tur'], adres: OkumaAdresi, kaynak: string | null = null): SoruEki => ({
    id: yeniId('ek'),
    tur,
    medyaDosyaId: yeniId('dosya'),
    kaynakDosyaId: kaynak,
    sureSn: tur === 'ses' ? 42 : null,
    cizimVerisi: null,
    sira: 0,
    adres,
  });

  function yeniSoru(o: {
    ogrenciId: string;
    ogrenciAdi: string;
    brans: string;
    metin: string;
    durum: SoruDetayi['durum'];
    once: number;
    cevap?: string;
  }): MockSoru {
    const kimlik = yeniId('soru');
    const mesajlar = [
      mesaj('soru', o.ogrenciId, 'ogrenci', o.ogrenciAdi, o.metin, t0 - o.once, [
        ek('fotograf', mockAdres(kimlik)),
      ]),
    ];
    if (o.cevap) {
      mesajlar.push(
        mesaj(
          'cevap',
          'uyelik-ogretmen-a',
          'ogretmen',
          'Ayşe Hoca',
          o.cevap,
          t0 - o.once + 30 * 60_000,
        ),
      );
    }
    mesajlar.forEach((m, i) => (m.sira = i + 1));
    return {
      id: kimlik,
      ogrenciId: o.ogrenciId,
      ogrenciAdi: o.ogrenciAdi,
      bransKodu: o.brans,
      konuId: null,
      baslik: null,
      onizleme: o.metin,
      durum: o.durum,
      mesajSayisi: mesajlar.length,
      olusturma: new Date(t0 - o.once).toISOString(),
      sonHareket: new Date(t0 - o.once + (o.cevap ? 30 * 60_000 : 0)).toISOString(),
      ilkCevap: o.cevap ? new Date(t0 - o.once + 30 * 60_000).toISOString() : null,
      cozuldu: o.durum === 'cozuldu' ? new Date(t0 - o.once + 2 * SAAT).toISOString() : null,
      fotoSilinme: null,
      yenidenAcmaSayisi: 0,
      adresAlinamadi: false,
      istekId: null,
      fotoIdleri: [kimlik],
      mesajlar,
      takipSayisi: 0,
    };
  }

  const sorular: MockSoru[] = [
    yeniSoru({
      ogrenciId: DENIZ,
      ogrenciAdi: 'Deniz Aydın',
      brans: 'matematik',
      metin: 'Üslü sayılarda bölmeyi anlamadım.',
      durum: 'cevaplandi',
      once: 3 * SAAT,
      cevap: 'Tabanlar aynıysa üsler birbirinden çıkarılır; örneği çözümde gösterdim.',
    }),
    yeniSoru({
      ogrenciId: DENIZ,
      ogrenciAdi: 'Deniz Aydın',
      brans: 'fizik',
      metin: 'Bileşke kuvveti hesaplarken takıldım.',
      durum: 'acik',
      once: 1 * SAAT,
    }),
    yeniSoru({
      ogrenciId: 'uyelik-ogrenci-b',
      ogrenciAdi: 'Elif Kaya',
      brans: 'matematik',
      metin: '5. soruda ikinci adımı yapamadım.',
      durum: 'acik',
      once: 5 * SAAT,
    }),
    yeniSoru({
      ogrenciId: 'uyelik-ogrenci-c',
      ogrenciAdi: 'Mert Demir',
      brans: 'matematik',
      metin: 'Denklem sistemini çözemiyorum.',
      durum: 'takip_bekliyor',
      once: 26 * SAAT,
      cevap: 'Önce bir değişkeni yalnız bırak.',
    }),
    yeniSoru({
      ogrenciId: DENIZ,
      ogrenciAdi: 'Deniz Aydın',
      brans: 'kimya',
      metin: 'Mol kavramı.',
      durum: 'cozuldu',
      once: 48 * SAAT,
      cevap: 'Mol, tanecik sayısını ifade eder.',
    }),
  ];

  function ozet(s: MockSoru): SoruOzeti {
    const {
      istekId: _i,
      fotoIdleri: _f,
      mesajlar: _m,
      takipSayisi: _t,
      fotoSilinme: _fs,
      yenidenAcmaSayisi: _y,
      adresAlinamadi: _a,
      ...o
    } = s;
    void [_i, _f, _m, _t, _fs, _y, _a];
    return { ...o, mesajSayisi: s.mesajlar.length };
  }

  function detay(s: MockSoru): SoruDetayi {
    const foto = s.mesajlar[0]?.ekler.filter((e) => e.tur === 'fotograf') ?? [];
    return kopya({
      ...ozet(s),
      fotoSilinme: s.fotoSilinme,
      yenidenAcmaSayisi: s.yenidenAcmaSayisi,
      kalanTakipHakki: Math.max(TAKIP_LIMITI - s.takipSayisi, 0),
      fotograflar: foto.map((e, i) => ({
        medyaDosyaId: e.medyaDosyaId,
        sira: i,
        adres: e.adres,
      })),
      mesajlar: s.mesajlar,
      adresAlinamadi: false,
    });
  }

  function gunSonu(): string {
    const d = new Date(simdi());
    d.setHours(24, 0, 0, 0);
    return d.toISOString();
  }
  function ayinSonu(): string {
    const d = new Date(simdi());
    return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();
  }
  function kota(ogrenciId: string): SoruKotasi {
    const bugun = new Date(simdi()).toDateString();
    const kullanilan = sorular.filter(
      (s) => s.ogrenciId === ogrenciId && new Date(s.olusturma).toDateString() === bugun,
    ).length;
    return {
      gunlukLimit: GUNLUK_LIMIT,
      gunlukKullanilan: kullanilan,
      gunlukKalan: Math.max(GUNLUK_LIMIT - kullanilan, 0),
      gunlukSifirlanma: gunSonu(),
      aylikKalan: null,
      aylikSifirlanma: ayinSonu(),
    };
  }

  function ekleri(ekler: EkGirdisi[] | undefined): SoruEki[] {
    return (ekler ?? []).map((e, i) => ({
      id: yeniId('ek'),
      tur: e.tur,
      medyaDosyaId: e.dosyaId,
      kaynakDosyaId: e.tur === 'cizimli_fotograf' ? e.kaynakDosyaId : null,
      sureSn: e.tur === 'ses' ? (e.sureSn ?? null) : null,
      cizimVerisi: e.tur === 'cizimli_fotograf' ? (e.cizimVerisi ?? null) : null,
      sira: i,
      adres: mockAdres(e.dosyaId, e.tur === 'ses' ? 'ses' : 'gorsel'),
    }));
  }

  function sayfa(liste: MockSoru[], imlec: string | null): SoruSayfasi {
    const ham = [...liste].sort((a, b) => Date.parse(b.sonHareket) - Date.parse(a.sonHareket));
    const bas = imlec ? Number(imlec) : 0;
    const dilim = ham.slice(bas, bas + 20);
    return {
      sorular: dilim.map(ozet),
      sonrakiImlec: bas + 20 < ham.length ? String(bas + 20) : null,
    };
  }
  const aramaEsle = (s: MockSoru, q: string | undefined) =>
    !q ||
    `${s.onizleme ?? ''} ${s.baslik ?? ''}`.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'));

  return {
    async sorularim(suzgec, imlec) {
      await gecik();
      const o = ogrenciOlmali();
      return sayfa(
        sorular.filter(
          (s) =>
            s.ogrenciId === o &&
            (!suzgec.bransKodu || s.bransKodu === suzgec.bransKodu) &&
            (!suzgec.durum || s.durum === suzgec.durum) &&
            aramaEsle(s, suzgec.q),
        ),
        imlec,
      );
    },
    async kota() {
      await gecik();
      return kota(ogrenciOlmali());
    },
    async soru(id) {
      await gecik();
      const s = sorular.find((x) => x.id === id);
      if (!s) throw bulunamadi();
      const o = ogrenciKimligi();
      if (o && s.ogrenciId !== o) throw bulunamadi();
      return detay(s);
    },
    async soruSor(g) {
      await gecik();
      const o = ogrenciOlmali();
      const var_ = sorular.find((s) => s.istekId === g.istekId);
      if (var_) {
        return {
          soru: detay(var_),
          tekrar: true,
          kota: kota(o),
          tahmin: { sureSn: 2 * 3600, ornekSayisi: 12, hedefMusait: musait.musait },
        };
      }
      const k = kota(o);
      if (k.gunlukKalan === 0) {
        throw new ApiHata('cok_istek', 'Bugünkü soru hakkınız doldu.', {
          durum: 429,
          ayrinti: 'kota_asildi',
          detay: {
            kota: {
              gunluk_limit: k.gunlukLimit,
              gunluk_kullanilan: k.gunlukKullanilan,
              gunluk_kalan: 0,
              gunluk_sifirlanma_at: k.gunlukSifirlanma,
              aylik_kalan: null,
              aylik_sifirlanma_at: k.aylikSifirlanma,
            },
            kota_turu: 'gunluk',
          },
        });
      }
      const id = yeniId('soru');
      const simdiIso = new Date(simdi()).toISOString();
      const m = mesaj(
        'soru',
        o,
        'ogrenci',
        'Deniz Aydın',
        g.metin ?? null,
        simdi(),
        g.fotograflar.map((f) => ({
          id: yeniId('ek'),
          tur: 'fotograf' as const,
          medyaDosyaId: f,
          kaynakDosyaId: null,
          sureSn: null,
          cizimVerisi: null,
          sira: 0,
          adres: mockAdres(f),
        })),
      );
      m.sira = 1;
      const s: MockSoru = {
        id,
        ogrenciId: o,
        ogrenciAdi: 'Deniz Aydın',
        bransKodu: g.bransKodu,
        konuId: g.konuId ?? null,
        baslik: g.baslik ?? null,
        onizleme: g.metin ?? null,
        durum: 'acik',
        mesajSayisi: 1,
        olusturma: simdiIso,
        sonHareket: simdiIso,
        ilkCevap: null,
        cozuldu: null,
        fotoSilinme: null,
        yenidenAcmaSayisi: 0,
        adresAlinamadi: false,
        istekId: g.istekId,
        fotoIdleri: g.fotograflar,
        mesajlar: [m],
        takipSayisi: 0,
      };
      sorular.push(s);
      return {
        soru: detay(s),
        tekrar: false,
        kota: kota(o),
        tahmin: {
          sureSn: musait.musait ? 2 * 3600 : null,
          ornekSayisi: 12,
          hedefMusait: musait.musait,
        },
      };
    },
    async anladim(id) {
      await gecik();
      const o = ogrenciOlmali();
      const s = sorular.find((x) => x.id === id && x.ogrenciId === o);
      if (!s) throw bulunamadi();
      if (s.durum === 'cozuldu') return detay(s);
      if (s.durum !== 'cevaplandi') throw durumHatasi();
      s.durum = 'cozuldu';
      s.cozuldu = new Date(simdi()).toISOString();
      s.sonHareket = s.cozuldu;
      return detay(s);
    },
    async takip(id, g) {
      await gecik();
      const o = ogrenciOlmali();
      const s = sorular.find((x) => x.id === id && x.ogrenciId === o);
      if (!s) throw bulunamadi();
      if (s.mesajlar.some((m) => m.id === `istek-${g.istekId}`)) return detay(s);
      if (s.durum !== 'cevaplandi' && s.durum !== 'cozuldu') throw durumHatasi();
      if (s.takipSayisi >= TAKIP_LIMITI) {
        throw new ApiHata('cakisma', undefined, { durum: 409, ayrinti: 'takip_limiti_asildi' });
      }
      if (s.durum === 'cozuldu') {
        s.yenidenAcmaSayisi += 1;
        s.cozuldu = null;
      }
      const m = mesaj('takip', o, 'ogrenci', 'Deniz Aydın', g.metin, simdi(), ekleri(g.ekler));
      m.id = `istek-${g.istekId}`;
      m.sira = s.mesajlar.length + 1;
      s.mesajlar.push(m);
      s.takipSayisi += 1;
      s.durum = 'takip_bekliyor';
      s.sonHareket = m.olusturma;
      return detay(s);
    },
    async bildir(id) {
      await gecik();
      ogrenciOlmali();
      if (!sorular.some((x) => x.id === id)) throw bulunamadi();
    },
    async gelenSorular(suzgec, imlec) {
      await gecik();
      personelOlmali();
      const liste = sorular
        .filter(
          (s) =>
            (s.durum === 'acik' || s.durum === 'takip_bekliyor') &&
            (!suzgec.bransKodu || s.bransKodu === suzgec.bransKodu) &&
            (!suzgec.ogrenciId || s.ogrenciId === suzgec.ogrenciId),
        )
        // Kuyruk en eski once.
        .sort((a, b) => Date.parse(a.sonHareket) - Date.parse(b.sonHareket));
      const bas = imlec ? Number(imlec) : 0;
      return {
        sorular: liste.slice(bas, bas + 20).map(ozet),
        sonrakiImlec: bas + 20 < liste.length ? String(bas + 20) : null,
      };
    },
    async gelenSoruSayisi() {
      await gecik();
      personelOlmali();
      const bekleyen = sorular.filter((s) => s.durum === 'acik' || s.durum === 'takip_bekliyor');
      const branslar = new Map<string, number>();
      for (const s of bekleyen) branslar.set(s.bransKodu, (branslar.get(s.bransKodu) ?? 0) + 1);
      return {
        bekleyen: bekleyen.length,
        branslar: [...branslar].map(([bransKodu, n]) => ({ bransKodu, bekleyen: n })),
        enEski: bekleyen.length
          ? bekleyen.map((s) => s.sonHareket).sort()[0] ?? null
          : null,
      };
    },
    async cevapla(id, g) {
      await gecik();
      personelOlmali();
      const s = sorular.find((x) => x.id === id);
      if (!s) throw bulunamadi();
      if (s.mesajlar.some((m) => m.id === `istek-${g.istekId}`)) return detay(s);
      if (s.durum !== 'acik' && s.durum !== 'takip_bekliyor') throw durumHatasi();
      if (!g.metin && !g.dersteKonusalim && !g.ekler?.length) {
        throw new ApiHata('dogrulama', undefined, { durum: 422, ayrinti: 'cevap_bos' });
      }
      const m = mesaj(
        'cevap',
        sec.aktifUyelikId() ?? 'uyelik-ogretmen-a',
        'ogretmen',
        'Ayşe Hoca',
        g.metin ?? null,
        simdi(),
        ekleri(g.ekler),
        g.dersteKonusalim,
      );
      m.id = `istek-${g.istekId}`;
      m.sira = s.mesajlar.length + 1;
      s.mesajlar.push(m);
      s.durum = 'cevaplandi';
      s.sonHareket = m.olusturma;
      s.ilkCevap ??= m.olusturma;
      return detay(s);
    },
    async cevapladiklarim(suzgec, imlec) {
      await gecik();
      personelOlmali();
      return sayfa(
        sorular.filter(
          (s) =>
            s.ilkCevap !== null &&
            (!suzgec.bransKodu || s.bransKodu === suzgec.bransKodu) &&
            (!suzgec.ogrenciId || s.ogrenciId === suzgec.ogrenciId) &&
            aramaEsle(s, suzgec.q),
        ),
        imlec,
      );
    },
    async musaitlik() {
      await gecik();
      personelOlmali();
      return { ...musait };
    },
    async musaitlikAyarla(m) {
      await gecik();
      personelOlmali();
      musait = {
        musait: m,
        musaitDegilTarihi: m ? null : new Date(simdi()).toISOString().slice(0, 10),
      };
      return { ...musait };
    },
  };
}
