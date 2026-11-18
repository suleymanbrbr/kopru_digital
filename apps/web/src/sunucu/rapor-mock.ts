import { MOCK_KURUM_ROLLERI, mockKurumVerisi } from './hesap-mock';
import type { MockIstek, MockYanit } from './vekil';
import { xlsxYaz } from './xlsx-mini';

/**
 * `NEXT_PUBLIC_API_MOCK=1` iken yonetici paneli (`rapor/*`) ve modul ayarlari uclarinin bellek ici
 * karsiligi (`services/api` `hesap|ders|ogrenme/rapor.ts`, `hesap-yollari.ts`). Yanit sekilleri
 * `@kopru/contracts` ile aynidir. Gruplar, uyeler ve atamalar `hesap-mock`tandir; gostergeler grup
 * sirasina gore SABIT (deterministik) uretilir, ogretmen gruplari sirayla paylasir. Ogretmen rolunde
 * yalniz atandigi gruplar donerken (kapsam `grup`) yonetici/sahipte tum aktif gruplar gorunur.
 * Yalniz deneme ve e2e icindir.
 */

type Servis = 'hesap' | 'ders' | 'ogrenme';
type Donem = '7' | '30';

const hata = (durum: number, kod: string, mesaj: string): MockYanit => ({
  durum,
  govde: { error: { code: kod, message: mesaj } },
});

const DEVAM = [0.92, 0.85, 0.78, 0.96];
const ANLADIM = [0.7, 0.55, 0.62, 0.8];
const ODEV = [0.88, 0.64, 0.75, 0.9];
const PLAN = [0.6, 0.72, 0.5, 0.85];
const COZ_SN = [1260, 3600, 540, 2100];

interface GrupSatiri {
  id: string;
  ad: string;
  tur: string;
  ogretmenId: string | null;
  ogrenciler: { id: string; ad: string }[];
}

const oran = (pay: number, payda: number) => ({
  pay,
  payda,
  oran: payda === 0 ? null : Math.round((pay / payda) * 10_000) / 10_000,
});

function donemTarihleri(donem: Donem) {
  const gun = Number(donem);
  const bitis = new Date();
  const baslangic = new Date(bitis.getTime() - (gun - 1) * 86_400_000);
  const g = (d: Date) => d.toISOString().slice(0, 10);
  return { donem_gun: gun, baslangic: g(baslangic), bitis: g(bitis) };
}

/** Kurumun rapora giren gruplari: ogretmen rolunde yalniz atandigi gruplar. */
function gruplariCoz(kurumId: string) {
  const v = mockKurumVerisi(kurumId);
  const rol = MOCK_KURUM_ROLLERI[kurumId];
  const ogretmenler = v.uyeler.filter((u) => u.rol === 'ogretmen');
  const ogrenciAdi = new Map(v.uyeler.map((u) => [u.uyelik_id, u.gorunen_ad]));
  const aktifler = v.gruplar.filter((g) => g.durum === 'aktif');
  const hepsi: GrupSatiri[] = aktifler.map((g, i) => ({
    id: g.id,
    ad: g.ad,
    tur: g.tur,
    // Atama varsa o, yoksa sirayla paylastirilir (mock deterministik olsun).
    ogretmenId:
      (v.atamalar.find((a) => a.grup_id === g.id)?.ogretmen_id as string | undefined) ??
      ogretmenler[i % Math.max(ogretmenler.length, 1)]?.uyelik_id ??
      null,
    ogrenciler: (v.grupUyeleri[g.id] ?? [])
      .filter((u) => u.bitis_tarihi === null)
      .map((u) => ({
        id: u.ogrenci_id as string,
        ad: ogrenciAdi.get(u.ogrenci_id as string) ?? '',
      })),
  }));
  const ogretmenAtanan = v.atamalar[0]?.ogretmen_id as string | undefined;
  const gruplar =
    rol === 'ogretmen' ? hepsi.filter((g) => g.ogretmenId === ogretmenAtanan && g.id) : hepsi;
  const kapsam = rol === 'ogretmen' ? ('grup' as const) : ('kurum' as const);
  return {
    gruplar:
      kapsam === 'grup'
        ? gruplar.filter((g) => v.atamalar.some((a) => a.grup_id === g.id))
        : gruplar,
    kapsam,
    ogretmenler: ogretmenler.map((o) => ({ id: o.uyelik_id, ad: o.gorunen_ad })),
    tumGruplar: hepsi,
  };
}

function ogrenciSayisi(gruplar: GrupSatiri[]): number {
  return new Set(gruplar.flatMap((g) => g.ogrenciler.map((o) => o.id))).size;
}

/** Grup sirasina gore gostergeler (donem 30'da paydalar 4 kati). */
function grupGostergeleri(g: GrupSatiri, sira: number, donem: Donem) {
  const k = donem === '30' ? 4 : 1;
  const n = g.ogrenciler.length;
  const al = (tablo: number[], payda: number) => {
    const p = payda * k;
    return oran(Math.round(p * (tablo[sira % 4] ?? 0.5)), p);
  };
  const soruSayisi = n * 2 * k;
  const cevaplanan = Math.max(soruSayisi - 1, 0);
  return {
    devam: al(DEVAM, n * 3),
    anladim: al(ANLADIM, n * 2),
    odev: al(ODEV, n * 2),
    plan: al(PLAN, n * 5),
    soru: {
      soru_sayisi: soruSayisi,
      cevaplanan,
      ortalama_ilk_cevap_sn: cevaplanan === 0 ? null : (COZ_SN[sira % 4] ?? 900),
      medyan_ilk_cevap_sn: cevaplanan === 0 ? null : Math.round((COZ_SN[sira % 4] ?? 900) * 0.8),
    },
  };
}

type Gosterge = ReturnType<typeof grupGostergeleri>;

function topla(liste: Gosterge[]) {
  const t = (anahtar: 'devam' | 'anladim' | 'odev' | 'plan') =>
    oran(
      liste.reduce((a, x) => a + x[anahtar].pay, 0),
      liste.reduce((a, x) => a + x[anahtar].payda, 0),
    );
  const soruSayisi = liste.reduce((a, x) => a + x.soru.soru_sayisi, 0);
  const cevaplanan = liste.reduce((a, x) => a + x.soru.cevaplanan, 0);
  const ort = (alan: 'ortalama_ilk_cevap_sn' | 'medyan_ilk_cevap_sn') => {
    const agirlikli = liste.reduce((a, x) => a + (x.soru[alan] ?? 0) * x.soru.cevaplanan, 0);
    return cevaplanan === 0 ? null : Math.round(agirlikli / cevaplanan);
  };
  return {
    devam: t('devam'),
    anladim: t('anladim'),
    odev: t('odev'),
    plan: t('plan'),
    soru: {
      soru_sayisi: soruSayisi,
      cevaplanan,
      ortalama_ilk_cevap_sn: ort('ortalama_ilk_cevap_sn'),
      medyan_ilk_cevap_sn: ort('medyan_ilk_cevap_sn'),
    },
  };
}

function ozetUret(kurumId: string, donem: Donem) {
  const { gruplar: ham, kapsam, ogretmenler } = gruplariCoz(kurumId);
  const gruplar = ham.map((g, i) => ({ ...g, gosterge: grupGostergeleri(g, i, donem) }));
  const ogretmenSatirlari = ogretmenler
    .map((o) => ({ ...o, gruplar: gruplar.filter((g) => g.ogretmenId === o.id) }))
    .filter((o) => o.gruplar.length > 0);
  return {
    ...donemTarihleri(donem),
    kapsam,
    gruplar,
    ogretmenSatirlari,
    kurum: topla(gruplar.map((g) => g.gosterge)),
    ogrenciSayisi: ogrenciSayisi(gruplar),
    etkin: Math.max(ogrenciSayisi(gruplar) - 1, 0),
  };
}

/** Bir grubun ya da ogretmenin gruplarindan suzulmus ogrenci satirlari (benzersiz). */
function suzulmusOgrenciler(kurumId: string, sorgu: URLSearchParams) {
  const { gruplar } = gruplariCoz(kurumId);
  const grupId = sorgu.get('grup_id');
  const ogretmenId = sorgu.get('ogretmen_id');
  const secili = gruplar.filter(
    (g) => (!grupId || g.id === grupId) && (!ogretmenId || g.ogretmenId === ogretmenId),
  );
  const harita = new Map<string, { id: string; ad: string; gruplar: string[] }>();
  for (const g of secili) {
    for (const o of g.ogrenciler) {
      const mevcut = harita.get(o.id) ?? { id: o.id, ad: o.ad, gruplar: [] };
      mevcut.gruplar.push(g.ad);
      harita.set(o.id, mevcut);
    }
  }
  return [...harita.values()].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

const yariDonem = (sira: number) => new Date(Date.now() - (sira + 1) * 86_400_000).toISOString();

function listeUret(servis: Servis, ad: string, kurumId: string, sorgu: URLSearchParams) {
  const ogrenciler = suzulmusOgrenciler(kurumId, sorgu);
  const k = sorgu.get('donem') === '30' ? 4 : 1;
  const sat = (liste: unknown[]) => ({ toplam_satir: liste.length, satirlar: liste });
  if (servis === 'hesap' && ad === 'ogrenciler') {
    return sat(ogrenciler.map((o) => ({ ogrenci_id: o.id, gorunen_ad: o.ad, gruplar: o.gruplar })));
  }
  const oranSatiri = (
    o: (typeof ogrenciler)[number],
    i: number,
    payda: number,
    ayrinti: object,
  ) => {
    const pay = Math.max(payda - ((i * 2 + 1) % (payda + 1)), 0);
    return {
      ogrenci_id: o.id,
      gorunen_ad: o.ad,
      pay,
      payda,
      oran: Math.round((pay / payda) * 10_000) / 10_000,
      ayrinti,
    };
  };
  const sirala = (l: { oran: number }[]) => [...l].sort((a, b) => a.oran - b.oran);
  if (servis === 'ders' && ad === 'devam') {
    return sat(
      sirala(
        ogrenciler.map((o, i) => {
          const payda = 3 * k;
          const gelmedi = (i + 1) % 3;
          const izinli = i % 4 === 3 ? 1 : 0;
          const gec = i % 5 === 0 ? 1 : 0;
          const geldi = Math.max(payda - gelmedi - izinli - gec, 0);
          return {
            ogrenci_id: o.id,
            gorunen_ad: o.ad,
            pay: geldi + gec,
            payda,
            oran: Math.round(((geldi + gec) / payda) * 10_000) / 10_000,
            ayrinti: { geldi, gec, gelmedi, izinli },
          };
        }),
      ),
    );
  }
  if (servis === 'ders' && ad === 'anladim') {
    return sat(
      sirala(
        ogrenciler.map((o, i) =>
          oranSatiri(o, i, 2 * k, { anladim: 1, kismen: 1, anlamadim: i % 2 }),
        ),
      ),
    );
  }
  if (servis === 'ogrenme' && ad === 'plan') {
    return sat(
      sirala(
        ogrenciler.map((o, i) =>
          oranSatiri(o, i, 5 * k, { tamam: 3, kismen: 1, yapilmadi: i % 3, bekliyor: 0 }),
        ),
      ),
    );
  }
  if (servis === 'ogrenme' && ad === 'odev') {
    return sat(
      ogrenciler
        .filter((_, i) => i % 2 === 0)
        .map((o, i) => ({
          ogrenci_odev_id: crypto.randomUUID(),
          odev_id: crypto.randomUUID(),
          baslik: ['Türev alıştırmaları', 'Paragraf soruları', 'Problemler 3'][i % 3] ?? 'Ödev',
          ogrenci_id: o.id,
          gorunen_ad: o.ad,
          son_teslim_at: yariDonem(i),
          durum: 'atandi',
        })),
    );
  }
  if (servis === 'ogrenme' && ad === 'soru') {
    return sat(
      ogrenciler.map((o, i) => ({
        soru_id: crypto.randomUUID(),
        ogrenci_id: o.id,
        gorunen_ad: o.ad,
        brans_kodu: ['matematik', 'fizik', 'turkce'][i % 3] ?? 'matematik',
        durum: i === 0 ? 'acik' : 'cevaplandi',
        sorulma_at: yariDonem(i),
        ilk_cevap_sn: i === 0 ? null : (COZ_SN[i % 4] ?? 900),
      })),
    );
  }
  return null;
}

const OZET_ALANLARI = (g: Gosterge, servis: Servis) =>
  servis === 'ders'
    ? { devam: g.devam, anladim: g.anladim }
    : { odev: g.odev, plan: g.plan, soru: g.soru };

function ozetYaniti(servis: Servis, kurumId: string, donem: Donem) {
  const o = ozetUret(kurumId, donem);
  const taban = {
    donem_gun: o.donem_gun,
    baslangic: o.baslangic,
    bitis: o.bitis,
    kapsam: o.kapsam,
  };
  if (servis === 'hesap') {
    return {
      ...taban,
      kurum: {
        aktif_ogrenci: o.ogrenciSayisi,
        grup_sayisi: o.gruplar.length,
        ogretmen_sayisi: o.ogretmenSatirlari.length,
      },
      gruplar: o.gruplar.map((g) => ({
        grup_id: g.id,
        ad: g.ad,
        tur: g.tur,
        aktif_ogrenci: g.ogrenciler.length,
      })),
      ogretmenler: o.ogretmenSatirlari.map((t) => ({
        ogretmen_id: t.id,
        gorunen_ad: t.ad,
        grup_sayisi: t.gruplar.length,
        aktif_ogrenci: ogrenciSayisi(t.gruplar),
      })),
    };
  }
  return {
    ...taban,
    kurum: {
      ...OZET_ALANLARI(o.kurum, servis),
      ...(servis === 'ogrenme' ? { etkin_ogrenci: o.etkin } : {}),
    },
    gruplar: o.gruplar.map((g) => ({
      grup_id: g.id,
      ...OZET_ALANLARI(g.gosterge, servis),
      ...(servis === 'ogrenme' ? { etkin_ogrenci: Math.max(g.ogrenciler.length - 1, 0) } : {}),
    })),
    ogretmenler: o.ogretmenSatirlari.map((t) => ({
      ogretmen_id: t.id,
      ...OZET_ALANLARI(topla(t.gruplar.map((g) => g.gosterge)), servis),
    })),
  };
}

function excelUret(kurumId: string, donem: Donem): Uint8Array {
  const o = ozetUret(kurumId, donem);
  const yuzde = (x: { oran: number | null }) => x.oran ?? '';
  return xlsxYaz([
    [`Gösterge (${o.baslangic} – ${o.bitis})`, 'Değer'],
    ['Aktif öğrenci', o.ogrenciSayisi],
    ['Devam oranı', yuzde(o.kurum.devam)],
    ['Ders sonu anladım oranı', yuzde(o.kurum.anladim)],
    ['Ödev teslim oranı', yuzde(o.kurum.odev)],
    ['Plan tamamlama oranı', yuzde(o.kurum.plan)],
  ]);
}

// --- Modul ayarlari ----------------------------------------------------------------------------

interface ModulAyari {
  id: string;
  modul_kodu: string;
  kapsam: 'kurum' | 'kademe' | 'grup';
  kapsam_id: string;
  acik: boolean;
}
/** Mock kurum kimlikleri (`kurum-mavi`) UUID degildir; sozlesme `kapsam_id` UUID ister: kurumdan turetilir. */
const kurumUuid = (kurumId: string): string => {
  let h = 0;
  for (const c of kurumId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `00000000-0000-4000-8000-${h.toString(16).padStart(12, '0')}`;
};
const kutu = globalThis as unknown as { __kopruModulMock?: Record<string, ModulAyari[]> };
const ayarlar = (kurumId: string): ModulAyari[] => {
  kutu.__kopruModulMock ??= {};
  kutu.__kopruModulMock[kurumId] ??= [];
  return kutu.__kopruModulMock[kurumId];
};

function modulAyarlari(kurumId: string, istek: MockIstek): MockYanit {
  const liste = ayarlar(kurumId);
  if (istek.yontem === 'GET') {
    const kurumEtkin: Record<string, boolean> = {};
    for (const a of liste) if (a.kapsam === 'kurum') kurumEtkin[a.modul_kodu] = a.acik;
    return { durum: 200, govde: { ayarlar: liste, kurum_etkin: kurumEtkin } };
  }
  const g = (typeof istek.govde === 'object' && istek.govde !== null ? istek.govde : {}) as {
    modul_kodu?: string;
    kapsam?: ModulAyari['kapsam'];
    kapsam_id?: string;
    acik?: boolean | null;
  };
  if (!g.modul_kodu || !g.kapsam || g.acik === undefined) {
    return hata(400, 'dogrulama_hatasi', 'İstek doğrulanamadı.');
  }
  const kapsamId = g.kapsam === 'kurum' ? kurumUuid(kurumId) : g.kapsam_id;
  if (!kapsamId) return hata(400, 'dogrulama_hatasi', 'kapsam_id geçersiz.');
  const indeks = liste.findIndex(
    (a) => a.modul_kodu === g.modul_kodu && a.kapsam === g.kapsam && a.kapsam_id === kapsamId,
  );
  if (g.acik === null) {
    if (indeks >= 0) liste.splice(indeks, 1);
    return { durum: 200, govde: { ayar: null } };
  }
  if (g.acik && g.kapsam !== 'kurum') {
    const ustKapali = liste.some(
      (a) => a.modul_kodu === g.modul_kodu && a.kapsam === 'kurum' && !a.acik,
    );
    if (ustKapali) {
      return hata(422, 'ust_duzey_kapali', 'Üst düzeyde kapalı olan modül alt düzeyde açılamaz.');
    }
  }
  const yeni: ModulAyari = {
    id: liste[indeks]?.id ?? crypto.randomUUID(),
    modul_kodu: g.modul_kodu,
    kapsam: g.kapsam,
    kapsam_id: kapsamId,
    acik: g.acik,
  };
  if (indeks >= 0) liste[indeks] = yeni;
  else liste.push(yeni);
  return { durum: 200, govde: { ayar: yeni } };
}

/** `rapor/*` ve `modul-ayarlari` uclari; ilgilenmiyorsa `undefined` (sonraki mock devralir). */
export function raporMock(servis: Servis, istek: MockIstek): MockYanit | undefined {
  const m = /^kurumlar\/([^/]+)\/(rapor\/([a-z-]+)|modul-ayarlari)$/.exec(istek.yol);
  if (!m?.[1]) return undefined;
  const kurumId = m[1];
  if (m[2] === 'modul-ayarlari') {
    if (servis !== 'hesap') return undefined;
    const rol = MOCK_KURUM_ROLLERI[kurumId];
    if (istek.yontem === 'PUT' && rol !== 'sahip' && rol !== 'yonetici') {
      return hata(403, 'izin_yok', 'Bu işlem için yetkin yok.');
    }
    return modulAyarlari(kurumId, istek);
  }
  if (istek.yontem !== 'GET') return undefined;
  const ad = m[3] ?? '';
  const rol = MOCK_KURUM_ROLLERI[kurumId];
  if (rol === undefined || rol === 'ogrenci')
    return hata(403, 'izin_yok', 'Bu işlem için yetkin yok.');
  const donemParam = istek.sorgu.get('donem') ?? '7';
  if (donemParam !== '7' && donemParam !== '30') {
    return hata(400, 'dogrulama_hatasi', 'donem 7 ya da 30 olmalı.');
  }
  if (ad === 'ozet') return { durum: 200, govde: ozetYaniti(servis, kurumId, donemParam) };
  if (ad === 'disa-aktar' && servis === 'ogrenme') {
    return {
      durum: 200,
      ikili: {
        bayt: excelUret(kurumId, donemParam),
        tur: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dosyaAdi: `panel-son-${donemParam}-gun.xlsx`,
      },
    };
  }
  const liste = listeUret(servis, ad, kurumId, istek.sorgu);
  return liste ? { durum: 200, govde: liste } : undefined;
}
