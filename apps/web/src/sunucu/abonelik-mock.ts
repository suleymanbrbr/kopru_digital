import type { AboneligiTipi, AbonelikPlanTipi, PlanLimitiDetay } from '@kopru/contracts';

import { mockSimdi } from './mock-zaman';
import type { MockIstek, MockYanit } from './vekil';

/**
 * `NEXT_PUBLIC_API_MOCK=1` iken `/api/abonelik/*` ucunun bellek ici karsiligi (yalniz sahip).
 * Durum `mock_senaryo` cerezindeki anahtara baglidir (`<anahtar>:<senaryo>`): paralel e2e testleri
 * birbirinin durumunu bozmaz; cerez yoksa `varsayilan:aktif`. Senaryolar: aktif, deneme, deneme-bitiyor,
 * askida, iptal-istendi, magaza, kurumsal, limit-dolu, odeme-bekliyor, ucretsiz, platform-askida.
 * Odeme "sahte donus" ile tamamlanir (`/api/abonelik-mock/donus`); aktivasyon birkac sn gecikir.
 */

export const MOCK_SAHIP_KURUM = 'kurum-kuzey';
/** Sahte donusten sonra aboneligin aktiflesmesi icin gecikme (ms): web'in kisa yoklamasini sinar. */
export const MOCK_AKTIVASYON_GECIKMESI_MS = 2500;

export const SENARYOLAR = [
  'aktif',
  'deneme',
  'deneme-bitiyor',
  'askida',
  'iptal-istendi',
  'magaza',
  'kurumsal',
  'limit-dolu',
  'odeme-bekliyor',
  'ucretsiz',
  'platform-askida',
] as const;
export type Senaryo = (typeof SENARYOLAR)[number];

type Kayit = Record<string, unknown>;

interface Durum {
  senaryo: Senaryo;
  abonelik: {
    durum: AboneligiTipi['durum'];
    kaynak: AboneligiTipi['kaynak'];
    planKodu: string;
    periyot: 'aylik' | 'yillik';
    donemBitis: number;
    denemeBitis: number | null;
    ekSureBitis: number | null;
    otomatikYenileme: boolean;
    iptalIstendi: number | null;
    bekleyenPlan: string | null;
    bekleyenPeriyot: 'aylik' | 'yillik' | null;
  } | null;
  fatura: {
    unvan: string;
    vergi_no: string;
    vergi_dairesi: string | null;
    adres: Kayit;
    eposta: string;
    e_fatura_mukellefi: boolean;
    surum: number;
  } | null;
  odemeler: Kayit[];
  faturalar: Kayit[];
  ogrenci: number;
  ogretmen: number;
  bekleyenOturum: { id: string; planKodu: string; periyot: 'aylik' | 'yillik' } | null;
  aktivasyon: {
    zaman: number;
    planKodu: string;
    periyot: 'aylik' | 'yillik';
    tutar: number;
    kdv: number;
  } | null;
  hataSayaci: number;
}

const GUN = 86_400_000;
const SAAT = 3_600_000;
const hata = (durum: number, kod: string, mesaj: string, details?: unknown): MockYanit => ({
  durum,
  govde: { error: { code: kod, message: mesaj, ...(details === undefined ? {} : { details }) } },
});
const dogrulama = (m = 'İstek doğrulanamadı.') => hata(400, 'dogrulama_hatasi', m);
const bulunamadi = () => hata(404, 'bulunamadi', 'Kaynak bulunamadı.');
const iso = (ms: number) => new Date(ms).toISOString();
const uid = () => crypto.randomUUID();
const metinDeger = (v: unknown): string => (typeof v === 'string' ? v : '');
const nesne = (g: unknown): Kayit => (typeof g === 'object' && g !== null ? (g as Kayit) : {});

const PLAN_KIMLIKLERI: Record<string, string> = {
  baslangic: '00000000-0000-4000-8000-0000000a0001',
  koc: '00000000-0000-4000-8000-0000000a0002',
  kurum: '00000000-0000-4000-8000-0000000a0003',
};

const PLANLAR: AbonelikPlanTipi[] = [
  plan('baslangic', 'Başlangıç', 29_900, 299_000, 15, 1, 1),
  plan('koc', 'Koç', 59_900, 599_000, 60, 3, 3),
  plan('kurum', 'Kurum', 499_900, 4_999_000, 500, 50, 20),
];

function plan(
  kod: string,
  ad: string,
  aylik: number,
  yillik: number,
  ogrenci: number,
  ogretmen: number,
  sube: number,
): AbonelikPlanTipi {
  return {
    id: PLAN_KIMLIKLERI[kod] ?? '00000000-0000-4000-8000-0000000a0099',
    kod,
    surum: 1,
    ad,
    kurum_turu: 'kurum',
    aylik_fiyat_kurus: aylik,
    yillik_fiyat_kurus: yillik,
    kdv_orani: 20,
    limitler: {
      max_ogrenci: ogrenci,
      max_ogretmen: ogretmen,
      max_sube: sube,
      medya_kota_bayt: 10_737_418_240,
      sms_aylik: 500,
      soru_aylik_ogrenci: -1,
    },
    moduller: [],
    magaza_urun_kodlari: null,
  };
}

const VARSAYILAN_PLAN: AbonelikPlanTipi = plan('baslangic', 'Başlangıç', 29_900, 299_000, 15, 1, 1);
const planBul = (kod: string) => PLANLAR.find((p) => p.kod === kod);
const UCRETSIZ_LIMIT = {
  max_ogrenci: 5,
  max_ogretmen: 1,
  max_sube: 1,
  medya_kota_bayt: 1_073_741_824,
  sms_aylik: 0,
  soru_aylik_ogrenci: -1,
};

const kutu = globalThis as unknown as { __kopruAbonelikMock?: Map<string, Durum> };
const depo = (): Map<string, Durum> => (kutu.__kopruAbonelikMock ??= new Map<string, Durum>());

/** `anahtar:senaryo` cerezini cozer; gecersiz senaryo `aktif` sayilir. */
export function senaryoCoz(cerez: string | undefined): { anahtar: string; senaryo: Senaryo } {
  if (!cerez) return { anahtar: 'varsayilan', senaryo: 'aktif' };
  const i = cerez.indexOf(':');
  const anahtar = (i < 0 ? 'varsayilan' : cerez.slice(0, i)) || 'varsayilan';
  const ad = i < 0 ? cerez : cerez.slice(i + 1);
  const senaryo = (SENARYOLAR as readonly string[]).includes(ad) ? (ad as Senaryo) : 'aktif';
  return { anahtar, senaryo };
}

function senaryoKur(senaryo: Senaryo): Durum {
  const simdi = mockSimdi();
  const d: Durum = {
    senaryo,
    abonelik: null,
    fatura: null,
    odemeler: [],
    faturalar: [],
    ogrenci: 8,
    ogretmen: 2,
    bekleyenOturum: null,
    aktivasyon: null,
    hataSayaci: 0,
  };
  const ab = (ek: Partial<NonNullable<Durum['abonelik']>>) => {
    d.abonelik = {
      durum: 'aktif',
      kaynak: 'iyzico',
      planKodu: 'koc',
      periyot: 'aylik',
      donemBitis: simdi + 20 * GUN,
      denemeBitis: null,
      ekSureBitis: null,
      otomatikYenileme: true,
      iptalIstendi: null,
      bekleyenPlan: null,
      bekleyenPeriyot: null,
      ...ek,
    };
  };
  const faturaVar = () => {
    d.fatura = {
      unvan: 'Kuzey Yıldızı Eğitim Ltd. Şti.',
      vergi_no: '1111111114',
      vergi_dairesi: 'Kadıköy',
      adres: { satir: 'Moda Cd. 1', ilce: 'Kadıköy', il: 'İstanbul' },
      eposta: 'fatura@kuzey.test',
      e_fatura_mukellefi: false,
      surum: 1,
    };
  };
  const odemeEkle = (ek: Kayit = {}) => {
    const id = uid();
    d.odemeler.push({
      id,
      abonelik_id: ABONELIK_ID,
      kaynak: 'iyzico',
      durum: 'basarili',
      tutar_kurus: 71_880,
      kdv_kurus: 11_980,
      donem_baslangic_at: iso(simdi - 10 * GUN),
      donem_bitis_at: iso(simdi + 20 * GUN),
      odeme_at: iso(simdi - 10 * GUN),
      hata_kodu: null,
      ters_cevrilen_id: null,
      ...ek,
    });
    d.faturalar.push({
      id: uid(),
      odeme_id: id,
      tur: 'e_arsiv',
      durum: 'kesildi',
      fatura_no: 'KOP2026000000001',
      matrah_kurus: 59_900,
      kdv_kurus: 11_980,
      toplam_kurus: 71_880,
      kdv_orani: 20,
      kesim_at: iso(simdi - 10 * GUN),
      pdf_dosya_id: null,
    });
  };
  switch (senaryo) {
    case 'aktif':
      ab({});
      faturaVar();
      odemeEkle();
      break;
    case 'deneme':
      ab({
        durum: 'deneme',
        kaynak: 'deneme',
        planKodu: 'kurum',
        donemBitis: simdi + 10 * GUN - SAAT,
        denemeBitis: simdi + 10 * GUN - SAAT,
        otomatikYenileme: false,
      });
      break;
    case 'deneme-bitiyor':
      ab({
        durum: 'deneme',
        kaynak: 'deneme',
        planKodu: 'kurum',
        donemBitis: simdi + 2 * GUN - SAAT,
        denemeBitis: simdi + 2 * GUN - SAAT,
        otomatikYenileme: false,
      });
      break;
    case 'askida':
      ab({ durum: 'askida', donemBitis: simdi - 30 * GUN, ekSureBitis: simdi - 23 * GUN });
      faturaVar();
      odemeEkle({ odeme_at: iso(simdi - 60 * GUN) });
      break;
    case 'iptal-istendi':
      ab({ otomatikYenileme: false, iptalIstendi: simdi - GUN });
      faturaVar();
      odemeEkle();
      break;
    case 'magaza':
      ab({ kaynak: 'apple' });
      odemeEkle({ kaynak: 'apple' });
      d.faturalar = [];
      break;
    case 'kurumsal':
      ab({ kaynak: 'kurumsal', planKodu: 'kurum', otomatikYenileme: false });
      break;
    case 'limit-dolu':
      ab({ planKodu: 'baslangic' });
      faturaVar();
      d.ogrenci = 15;
      d.ogretmen = 1;
      break;
    case 'odeme-bekliyor':
      ab({ durum: 'odeme_bekliyor' });
      faturaVar();
      odemeEkle({ odeme_at: iso(simdi - 30 * GUN) });
      break;
    case 'ucretsiz':
    case 'platform-askida':
      break;
  }
  return d;
}

const ABONELIK_ID = '00000000-0000-4000-8000-0000000ab001';

function durumAl(anahtar: string, senaryo: Senaryo): Durum {
  const m = depo();
  const k = `${anahtar}:${senaryo}`;
  let d = m.get(k);
  if (!d) {
    d = senaryoKur(senaryo);
    m.set(k, d);
  }
  aktivasyonuIsle(d);
  return d;
}

/** Gecikmeli aktivasyon: zaman gelince abonelik aktif olur, odeme ve fatura satiri eklenir. */
function aktivasyonuIsle(d: Durum): void {
  const a = d.aktivasyon;
  if (!a || mockSimdi() < a.zaman) return;
  const simdi = mockSimdi();
  const bitis = simdi + (a.periyot === 'yillik' ? 365 : 30) * GUN;
  d.abonelik = {
    durum: 'aktif',
    kaynak: 'iyzico',
    planKodu: a.planKodu,
    periyot: a.periyot,
    donemBitis: bitis,
    denemeBitis: null,
    ekSureBitis: null,
    otomatikYenileme: true,
    iptalIstendi: null,
    bekleyenPlan: null,
    bekleyenPeriyot: null,
  };
  const odemeId = uid();
  d.odemeler.push({
    id: odemeId,
    abonelik_id: ABONELIK_ID,
    kaynak: 'iyzico',
    durum: 'basarili',
    tutar_kurus: a.tutar,
    kdv_kurus: a.kdv,
    donem_baslangic_at: iso(simdi),
    donem_bitis_at: iso(bitis),
    odeme_at: iso(simdi),
    hata_kodu: null,
    ters_cevrilen_id: null,
  });
  d.faturalar.push({
    id: uid(),
    odeme_id: odemeId,
    tur: 'e_arsiv',
    durum: 'kesildi',
    fatura_no: `KOP${String(2026_000_000_000 + d.faturalar.length + 2)}`,
    matrah_kurus: a.tutar - a.kdv,
    kdv_kurus: a.kdv,
    toplam_kurus: a.tutar,
    kdv_orani: 20,
    kesim_at: iso(simdi),
    pdf_dosya_id: null,
  });
  d.aktivasyon = null;
}

function aboneligiYanit(d: Durum): AboneligiTipi | null {
  const a = d.abonelik;
  if (!a) return null;
  const p = planBul(a.planKodu) ?? VARSAYILAN_PLAN;
  const fiyat = a.periyot === 'yillik' ? (p.yillik_fiyat_kurus ?? 0) : p.aylik_fiyat_kurus;
  return {
    id: ABONELIK_ID,
    plan: p,
    kaynak: a.kaynak,
    durum: a.durum,
    periyot: a.periyot,
    donem_baslangic_at: iso(a.donemBitis - 30 * GUN),
    donem_bitis_at: iso(a.donemBitis),
    deneme_bitis_at: a.denemeBitis === null ? null : iso(a.denemeBitis),
    ek_sure_bitis_at: a.ekSureBitis === null ? null : iso(a.ekSureBitis),
    otomatik_yenileme: a.otomatikYenileme,
    iptal_istendi_at: a.iptalIstendi === null ? null : iso(a.iptalIstendi),
    fiyat_kurus: a.kaynak === 'deneme' ? 0 : fiyat,
    bekleyen_plan_kodu: a.bekleyenPlan,
    bekleyen_periyot: a.bekleyenPeriyot,
  };
}

const ETKIN = ['deneme', 'aktif', 'odeme_bekliyor', 'ek_sure'];
const UCRETLI_ETKIN = ['aktif', 'odeme_bekliyor', 'ek_sure'];

function limitler(d: Durum) {
  const a = d.abonelik;
  if (!a || !ETKIN.includes(a.durum)) return UCRETSIZ_LIMIT;
  return (planBul(a.planKodu) ?? VARSAYILAN_PLAN).limitler;
}

const sinir = (n: number) => (n < 0 ? null : n);

function limitAsimlari(d: Durum, hedef: AbonelikPlanTipi): PlanLimitiDetay[] {
  const sonuc: PlanLimitiDetay[] = [];
  if (hedef.limitler.max_ogrenci >= 0 && d.ogrenci > hedef.limitler.max_ogrenci) {
    sonuc.push({ limit: 'max_ogrenci', mevcut: d.ogrenci, ust_sinir: hedef.limitler.max_ogrenci });
  }
  if (hedef.limitler.max_ogretmen >= 0 && d.ogretmen > hedef.limitler.max_ogretmen) {
    sonuc.push({
      limit: 'max_ogretmen',
      mevcut: d.ogretmen,
      ust_sinir: hedef.limitler.max_ogretmen,
    });
  }
  return sonuc;
}

/** hesap mock'u: ogrenci limiti dolu senaryoda yeni ogrenci eklenemez (402 `plan_limiti`). */
export function mockOgrenciLimitiDolu(cerez: string | undefined): PlanLimitiDetay | null {
  const { anahtar, senaryo } = senaryoCoz(cerez);
  if (senaryo !== 'limit-dolu') return null;
  const d = durumAl(anahtar, senaryo);
  const ust = limitler(d).max_ogrenci;
  return ust >= 0 && d.ogrenci >= ust
    ? { limit: 'max_ogrenci', mevcut: d.ogrenci, ust_sinir: ust }
    : null;
}

/** Sahte odeme sayfasi donusu (`/api/abonelik-mock/donus`): sonucu isler, web `?odeme=` degerini dondurur. */
export function mockOdemeDonusu(cerez: string | undefined, sonuc: string): string {
  const { anahtar, senaryo } = senaryoCoz(cerez);
  const d = durumAl(anahtar, senaryo);
  const o = d.bekleyenOturum;
  if (!o) return 'bulunamadi';
  d.bekleyenOturum = null;
  if (sonuc !== 'basarili') return sonuc === 'basarisiz' ? 'basarisiz' : 'hata';
  const p = planBul(o.planKodu) ?? VARSAYILAN_PLAN;
  const matrah = o.periyot === 'yillik' ? (p.yillik_fiyat_kurus ?? 0) : p.aylik_fiyat_kurus;
  const kdv = Math.round((matrah * p.kdv_orani) / 100);
  d.aktivasyon = {
    zaman: mockSimdi() + MOCK_AKTIVASYON_GECIKMESI_MS,
    planKodu: o.planKodu,
    periyot: o.periyot,
    tutar: matrah + kdv,
    kdv,
  };
  return 'basarili';
}

function faturaGecerli(g: Kayit): Kayit | string {
  const adres = nesne(g.adres);
  const metin = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  if (!metin(g.unvan)) return 'unvan';
  if (!/^[0-9]{10,11}$/.test(metinDeger(g.vergi_no))) return 'vergi_no';
  if (!metin(adres.satir) || !metin(adres.ilce) || !metin(adres.il)) return 'adres';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(metin(g.eposta))) return 'eposta';
  return {
    unvan: metin(g.unvan),
    vergi_no: metinDeger(g.vergi_no),
    vergi_dairesi: metin(g.vergi_dairesi) || null,
    adres: {
      satir: metin(adres.satir),
      ilce: metin(adres.ilce),
      il: metin(adres.il),
      ...(metin(adres.posta_kodu) ? { posta_kodu: metin(adres.posta_kodu) } : {}),
    },
    eposta: metin(g.eposta),
    e_fatura_mukellefi: g.e_fatura_mukellefi === true,
  };
}

export function abonelikMock(istek: MockIstek): MockYanit {
  const p = istek.yol.split('/');
  if (p[0] !== 'kurumlar' || !p[1]) return bulunamadi();
  if (p[1] !== MOCK_SAHIP_KURUM) {
    return hata(403, 'izin_yok', 'Bu işlem için yetkin yok.');
  }
  const { anahtar, senaryo } = senaryoCoz(istek.senaryo);
  const d = durumAl(anahtar, senaryo);
  const alt = p.slice(2).join('/');
  const { yontem } = istek;
  const g = nesne(istek.govde);

  if (senaryo === 'platform-askida') {
    return hata(403, 'kurum_askida', 'Kurum hesabı askıya alındı.');
  }

  if (alt === 'planlar' && yontem === 'GET') return { durum: 200, govde: { planlar: PLANLAR } };

  if (alt === 'abonelik' && yontem === 'GET') {
    const a = d.abonelik;
    const etkin = a !== null && ETKIN.includes(a.durum);
    const lim = limitler(d);
    return {
      durum: 200,
      govde: {
        abonelik: aboneligiYanit(d),
        ucretsiz: !etkin,
        yazma_kilitli: a !== null && (a.durum === 'askida' || a.durum === 'sona_erdi'),
        limitler: lim,
        kullanim: {
          ogrenci: { mevcut: d.ogrenci, ust_sinir: sinir(lim.max_ogrenci) },
          ogretmen: { mevcut: d.ogretmen, ust_sinir: sinir(lim.max_ogretmen) },
        },
      },
    };
  }

  if (alt === 'fatura-bilgileri') {
    if (yontem === 'GET') return { durum: 200, govde: { fatura_bilgisi: d.fatura } };
    if (yontem === 'PUT') {
      const s = faturaGecerli(g);
      if (typeof s === 'string') return dogrulama(`Geçersiz alan: ${s}`);
      d.fatura = {
        ...(s as Omit<NonNullable<Durum['fatura']>, 'surum'>),
        surum: (d.fatura?.surum ?? 0) + 1,
      };
      return { durum: 200, govde: { fatura_bilgisi: d.fatura } };
    }
  }

  if (alt === 'abonelik/iptal' && yontem === 'POST') {
    const a = d.abonelik;
    if (!a || !UCRETLI_ETKIN.includes(a.durum)) {
      return hata(409, 'etkin_abonelik_yok', 'Etkin bir ücretli aboneliğin yok.');
    }
    if (a.kaynak === 'apple' || a.kaynak === 'google') {
      return hata(409, 'magaza_uzerinden_yonetilir', 'Bu abonelik mağaza üzerinden yönetilir.');
    }
    if (a.iptalIstendi === null) {
      a.otomatikYenileme = false;
      a.iptalIstendi = mockSimdi();
    }
    return { durum: 200, govde: { abonelik: aboneligiYanit(d) } };
  }

  if (alt === 'abonelik/plan-degistir' && yontem === 'POST') {
    const hedef = planBul(metinDeger(g.plan_kodu));
    if (!hedef) return hata(404, 'plan_bulunamadi', 'Plan bulunamadı.');
    const a = d.abonelik;
    if (!a || !ETKIN.includes(a.durum)) {
      return hata(409, 'etkin_abonelik_yok', 'Etkin bir aboneliğin yok.');
    }
    const periyot = g.periyot === 'yillik' ? 'yillik' : g.periyot === 'aylik' ? 'aylik' : a.periyot;
    let uygulama: 'hemen' | 'donem_sonu';
    if (a.durum === 'deneme') {
      a.planKodu = hedef.kod;
      a.periyot = periyot;
      uygulama = 'hemen';
    } else {
      a.bekleyenPlan = hedef.kod;
      a.bekleyenPeriyot = periyot;
      uygulama = 'donem_sonu';
    }
    return {
      durum: 200,
      govde: { abonelik: aboneligiYanit(d), uygulama, limit_asimlari: limitAsimlari(d, hedef) },
    };
  }

  if (alt === 'odeme/baslat' && yontem === 'POST') {
    const hedef = planBul(metinDeger(g.plan_kodu));
    if (!hedef) return hata(404, 'plan_bulunamadi', 'Plan bulunamadı.');
    const periyot = g.periyot === 'yillik' ? 'yillik' : 'aylik';
    const a = d.abonelik;
    if (a && UCRETLI_ETKIN.includes(a.durum) && a.kaynak !== 'iyzico') {
      return hata(409, 'abonelik_baska_kanalda', 'Aboneliğin başka bir kanalda etkin.', {
        kaynak: a.kaynak,
      });
    }
    if (a?.kaynak === 'iyzico' && a.durum === 'aktif') {
      return hata(409, 'abonelik_zaten_aktif', 'Aboneliğin zaten aktif.');
    }
    if (!d.fatura) {
      return hata(422, 'fatura_bilgisi_gerekli', 'Ödeme başlatmak için fatura bilgisi gerekli.');
    }
    const matrah = periyot === 'yillik' ? (hedef.yillik_fiyat_kurus ?? 0) : hedef.aylik_fiyat_kurus;
    const kdv = Math.round((matrah * hedef.kdv_orani) / 100);
    const oturumId = uid();
    d.bekleyenOturum = { id: oturumId, planKodu: hedef.kod, periyot };
    return {
      durum: 200,
      govde: {
        oturum_id: oturumId,
        kaynak: 'iyzico',
        yonlendirme_url: `${istek.kaynak ?? ''}/api/abonelik-mock/donus?sonuc=basarili`,
        form_icerigi: null,
        tutar_kurus: matrah + kdv,
        kdv_kurus: kdv,
      },
    };
  }

  if (alt === 'odemeler' && yontem === 'GET') {
    return { durum: 200, govde: { odemeler: [...d.odemeler].reverse() } };
  }
  if (alt === 'faturalar' && yontem === 'GET') {
    return { durum: 200, govde: { faturalar: [...d.faturalar].reverse() } };
  }
  return bulunamadi();
}

/** Platform mesaji mock'u (`mock_platform_mesaji` cerezi: bilgi | uyari | kritik; yoksa mesaj yok). */
export function platformMesajiMock(cerez: string | undefined): { mesaj: Kayit | null } {
  if (cerez !== 'bilgi' && cerez !== 'uyari' && cerez !== 'kritik') return { mesaj: null };
  const kimlik = {
    bilgi: '00000000-0000-4000-8000-0000000bb001',
    uyari: '00000000-0000-4000-8000-0000000bb002',
    kritik: '00000000-0000-4000-8000-0000000bb003',
  }[cerez];
  const simdi = mockSimdi();
  return {
    mesaj: {
      id: kimlik,
      baslik: cerez === 'bilgi' ? 'Yeni özellik' : 'Planlı bakım',
      metin:
        cerez === 'bilgi'
          ? 'Abonelik ekranı yenilendi.'
          : 'Bu gece 02:00–03:00 arasında kısa bir bakım yapılacak.',
      onem: cerez,
      baslangic_at: iso(simdi - 3_600_000),
      bitis_at: iso(simdi + 86_400_000),
    },
  };
}
