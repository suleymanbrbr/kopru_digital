import { MutationObserver, QueryClient } from '@tanstack/react-query';

import type { HesapAdapter } from '../api/adaptorler';
import { mockAdaptorler } from '../api/mock';
import { ApiHata, type GrupKatilimIstegi, type SinifBekleyenleri } from '../api/tipler';
import { bellekBelirtecDeposu } from '../depo/belirtecDeposu';
import { oturumYoneticisiOlustur } from '../oturum/yonetici';
import { hataMesaji, katilimHataMesaji } from '../uygulama/hatalar';
import { cevrimiciKorumali } from './cevrimici';
import {
  katilimKarariSecenekleri,
  sinifBekleyenleriAnahtari,
  type KararGirdisi,
} from './katilimIstekleri';
import { kodBicimle, kodDogrula, kodGoster } from './sinifKodu';

/** gcTime sonsuz: sayac zamanlayicisi birakmaz (jest acik tutamaci olmasin). */
const acik: QueryClient[] = [];
function yeniQc() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity, retry: false },
      mutations: { gcTime: Infinity },
    },
  });
  acik.push(qc);
  return qc;
}
afterEach(() => {
  acik.splice(0).forEach((q) => {
    q.clear();
  });
});

/** Testlerde "var olmali" degerleri icin (non-null assertion yerine). */
function gerekli<T>(v: T | undefined): T {
  if (v === undefined) throw new Error('deger bekleniyordu');
  return v;
}

const ANAHTAR = sinifBekleyenleriAnahtari('uyelik-1');

const istek = (id: string, ad: string, dk: number): GrupKatilimIstegi => ({
  id,
  grupId: 'g1',
  kullaniciId: `k-${id}`,
  gorunenAd: ad,
  olusturma: new Date(Date.UTC(2026, 10, 8, 10, dk)).toISOString(),
});

const baslangic = (): SinifBekleyenleri[] => [
  {
    grup: { id: 'g1', ad: '8-A', uyeSayisi: 10 },
    istekler: [istek('i1', 'Ali', 1), istek('i2', 'Ayse', 2), istek('i3', 'Can', 3)],
  },
  { grup: { id: 'g2', ad: '8-B', uyeSayisi: 5 }, istekler: [istek('j1', 'Deniz', 1)] },
];

function hesapSahte(ez: Partial<HesapAdapter> = {}): HesapAdapter {
  const yok = () => Promise.reject(new Error('beklenmeyen cagri'));
  return {
    sinifKoduKatil: yok,
    sinifKoduIsteklerim: yok,
    sinifKoduIstegiIptal: yok,
    sinifBekleyenleri: () => Promise.resolve(baslangic()),
    katilimIstegiOnayla: () => Promise.resolve(),
    katilimIstegiReddet: () => Promise.resolve(),
    katilimKodu: yok,
    katilimKoduYenile: yok,
    davetKabul: yok,
    oturumlar: yok,
    oturumSonlandir: yok,
    oturumlariKapat: yok,
    ...ez,
  };
}

function karar(qc: QueryClient, hesap: HesapAdapter) {
  const obs = new MutationObserver(qc, katilimKarariSecenekleri(qc, hesap, ANAHTAR));
  return (g: KararGirdisi) => {
    void obs.mutate(g).catch(() => undefined);
  };
}

const ids = (qc: QueryClient, grup = 'g1') =>
  qc
    .getQueryData<SinifBekleyenleri[]>(ANAHTAR)
    ?.find((g) => g.grup.id === grup)
    ?.istekler.map((i) => i.id);

describe('ogretmen onayi: iyimser guncelleme', () => {
  it('onay istek listeden aninda kalkar; basarida sunucu verisiyle tazelenir', async () => {
    const qc = yeniQc();
    qc.setQueryData(ANAHTAR, baslangic());
    let birak: () => void = () => undefined;
    const bekletilen = new Promise<void>((r) => {
      birak = r;
    });
    const onayla = jest.fn(() => bekletilen);
    const calistir = karar(qc, hesapSahte({ katilimIstegiOnayla: onayla }));

    calistir({ grupId: 'g1', istekId: 'i1', karar: 'onayla' });
    await new Promise((r) => setTimeout(r, 0));
    expect(ids(qc)).toEqual(['i2', 'i3']); // sunucu yaniti beklenmeden kalkti
    expect(onayla).toHaveBeenCalledWith('g1', 'i1');
    birak();
    await new Promise((r) => setTimeout(r, 5));
    expect(ids(qc)).toEqual(['i2', 'i3']);
  });

  it('red de ayni sekilde aninda kalkar ve reddet ucunu cagirir', async () => {
    const qc = yeniQc();
    qc.setQueryData(ANAHTAR, baslangic());
    const reddet = jest.fn(() => new Promise<void>(() => undefined));
    karar(
      qc,
      hesapSahte({ katilimIstegiReddet: reddet }),
    )({
      grupId: 'g2',
      istekId: 'j1',
      karar: 'reddet',
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(ids(qc, 'g2')).toEqual([]);
    expect(reddet).toHaveBeenCalledWith('g2', 'j1');
  });

  it('hata olursa istek eski yerine (siraya gore) geri konur', async () => {
    const qc = yeniQc();
    qc.setQueryData(ANAHTAR, baslangic());
    const calistir = karar(
      qc,
      hesapSahte({
        katilimIstegiOnayla: () =>
          Promise.reject(new ApiHata('cakisma', 'x', { durum: 409, ayrinti: 'kapasite_dolu' })),
      }),
    );
    calistir({ grupId: 'g1', istekId: 'i2', karar: 'onayla' });
    await new Promise((r) => setTimeout(r, 10));
    expect(ids(qc)).toEqual(['i1', 'i2', 'i3']);
  });

  it('cevrimdisi hatasinda da geri alinir', async () => {
    const qc = yeniQc();
    qc.setQueryData(ANAHTAR, baslangic());
    const sahte = hesapSahte({
      katilimIstegiReddet: () => Promise.reject(new ApiHata('cevrimdisi')),
    });
    karar(qc, sahte)({ grupId: 'g2', istekId: 'j1', karar: 'reddet' });
    await new Promise((r) => setTimeout(r, 10));
    expect(ids(qc, 'g2')).toEqual(['j1']);
  });

  it('iki karar ucustayken biri basarisiz olursa yalniz o geri gelir', async () => {
    const qc = yeniQc();
    qc.setQueryData(ANAHTAR, baslangic());
    const hesap = hesapSahte({
      katilimIstegiOnayla: (_g, id) =>
        id === 'i1' ? Promise.resolve() : Promise.reject(new ApiHata('ag')),
    });
    // Her cagri ayri gozlemciyle (ayri butonlar gibi).
    karar(qc, hesap)({ grupId: 'g1', istekId: 'i1', karar: 'onayla' });
    karar(qc, hesap)({ grupId: 'g1', istekId: 'i2', karar: 'onayla' });
    await new Promise((r) => setTimeout(r, 15));
    expect(ids(qc)).toEqual(['i2', 'i3']);
  });
});

describe('mock adaptor ile onay (kapasite_dolu geri alma akisi)', () => {
  it('Kapasite Deneme onaylanamaz (409), digerleri onaylanir', async () => {
    const depo = bellekBelirtecDeposu();
    await depo.yaz({ erisim: 'a', yenileme: 'b', erisimBitis: 1 });
    const m = mockAdaptorler(depo, 0).hesap;
    const once = await m.sinifBekleyenleri();
    const g = gerekli(once[0]);
    const kapasite = gerekli(g.istekler.find((i) => i.gorunenAd === 'Kapasite Deneme'));
    const e = await m.katilimIstegiOnayla(g.grup.id, kapasite.id).catch((x: unknown) => x);
    expect(e).toMatchObject({ kod: 'cakisma', ayrinti: 'kapasite_dolu' });
    await m.katilimIstegiOnayla(g.grup.id, gerekli(g.istekler[0]).id);
    const sonra = await m.sinifBekleyenleri();
    expect(gerekli(sonra[0]).istekler).toHaveLength(g.istekler.length - 1);
    expect(gerekli(sonra[0]).grup.uyeSayisi).toBe(g.grup.uyeSayisi + 1);
  });
});

describe('katilim hata mesajlari', () => {
  const mesaj = (kod: ApiHata['kod'], ayrinti?: string) =>
    katilimHataMesaji(new ApiHata(kod, undefined, ayrinti ? { ayrinti } : {}));

  it('410 kod_gecersiz: tum nedenler icin tek aciklayici mesaj', () => {
    expect(mesaj('kod_gecersiz')).toMatch(/geçersiz, kapatılmış ya da süresi dolmuş/);
  });
  it('409 zaten_uye', () => {
    expect(mesaj('zaten_uye')).toMatch(/zaten üyesin/);
  });
  it('429: 15 dakika bekleme, OTP mesajindan farkli', () => {
    expect(mesaj('cok_istek')).toMatch(/15 dakika/);
    expect(hataMesaji(new ApiHata('cok_istek'))).not.toMatch(/15 dakika/);
    expect(hataMesaji(new ApiHata('otp_cok_deneme'))).toMatch(/yanlış deneme/);
  });
  it('409 cakisma ayrintiya gore ozel mesaj verir', () => {
    expect(mesaj('cakisma', 'kapasite_dolu')).toMatch(/kapasitesi dolu/);
    expect(mesaj('cakisma', 'kod_kullanim_doldu')).toMatch(/kullanım sınırı/);
    expect(mesaj('cakisma', 'uyelik_askida')).toMatch(/askıda/);
    expect(mesaj('cakisma', 'istek_beklemiyor')).toMatch(/beklemede değil/);
    expect(mesaj('cakisma')).toMatch(/çakıştı/);
  });
  it('cevrimdisi islem mesaji', () => {
    expect(mesaj('cevrimdisi')).toMatch(/Çevrimdışısın/);
  });
  it('410 davet_gecersiz', () => {
    expect(mesaj('davet_gecersiz')).toMatch(/geçersiz, süresi dolmuş ya da daha önce kullanılmış/);
  });
});

describe('cevrimdisi koruma', () => {
  it('cevrimdisiyken hicbir hesap cagrisi gonderilmez ve cevrimdisi hatasi atilir', async () => {
    const sahte = hesapSahte();
    const ham = jest.fn(() => Promise.resolve());
    const korumali = cevrimiciKorumali({ ...sahte, katilimIstegiOnayla: ham }, () => false);
    await expect(korumali.katilimIstegiOnayla('g', 'i')).rejects.toMatchObject({
      kod: 'cevrimdisi',
    });
    await expect(korumali.sinifKoduKatil('ABCD2345')).rejects.toMatchObject({ kod: 'cevrimdisi' });
    await expect(korumali.oturumlariKapat(false)).rejects.toMatchObject({ kod: 'cevrimdisi' });
    expect(ham).not.toHaveBeenCalled();
  });

  it('cevrimiciyken cagrilar gecer', async () => {
    const ham = jest.fn(() => Promise.resolve());
    const korumali = cevrimiciKorumali(hesapSahte({ katilimIstegiOnayla: ham }), () => true);
    await korumali.katilimIstegiOnayla('g', 'i');
    expect(ham).toHaveBeenCalledWith('g', 'i');
  });
});

describe('sinif kodu bicimi', () => {
  it('kucuk harf ve bosluk tolere edilir, buyuk harfe cevrilir', () => {
    expect(kodBicimle('abcd 2345')).toBe('ABCD2345');
    expect(kodBicimle(' ab-cd 23 45 ')).toBe('ABCD2345');
    expect(kodBicimle('abcd2345xyz')).toBe('ABCD2345');
  });
  it('dogrulama: uzunluk ve alfabe (I, L, O, 0, 1 yok)', () => {
    expect(kodDogrula('abcd2345')).toBe('tamam');
    expect(kodDogrula('abc')).toBe('uzunluk');
    expect(kodDogrula('ABCD2O45')).toBe('karakter');
    expect(kodDogrula('ABCD2I45')).toBe('karakter');
    expect(kodDogrula('ABCD2045')).toBe('karakter');
  });
  it('gosterim 4+4', () => {
    expect(kodGoster('ABCD2345')).toBe('ABCD 2345');
  });
});

describe('ogrenci: sinif kodu akisi (mock)', () => {
  async function ogrenci() {
    const depo = bellekBelirtecDeposu();
    const adaptorler = mockAdaptorler(depo, 0);
    await adaptorler.auth.otpDogrula('+905551110006', '123456');
    return adaptorler.hesap;
  }

  it('katil -> bekleyen listede gorunur -> iptal -> listeden duser', async () => {
    const h = await ogrenci();
    const i = await h.sinifKoduKatil('MATEM234');
    expect(i.durum).toBe('bekliyor');
    // Ayni bekleyen istek tekrar gonderilirse ayni istek doner (api 200 davranisi).
    expect((await h.sinifKoduKatil('MATEM234')).id).toBe(i.id);
    expect(await h.sinifKoduIsteklerim()).toHaveLength(1);
    await h.sinifKoduIstegiIptal(i.id);
    expect(await h.sinifKoduIsteklerim()).toHaveLength(0);
  });

  it('gecersiz, zaten uye ve hiz siniri hatalari', async () => {
    const h = await ogrenci();
    await expect(h.sinifKoduKatil('ZZZZ2345')).rejects.toMatchObject({ kod: 'kod_gecersiz' });
    await expect(h.sinifKoduKatil('ZATEN234')).rejects.toMatchObject({ kod: 'zaten_uye' });
    await expect(h.sinifKoduKatil('BEKLE234')).rejects.toMatchObject({ kod: 'cok_istek' });
  });

  it('uyeliksiz hesapta (telefon ...6) uyelik listesi bos', async () => {
    const depo = bellekBelirtecDeposu();
    const adaptorler = mockAdaptorler(depo, 0);
    const oturum = oturumYoneticisiOlustur({ adaptorler });
    await adaptorler.auth.otpDogrula('+905551110006', '123456');
    await oturum.girisTamamlandi();
    const d = oturum.depo.al();
    if (d.asama !== 'giris') throw new Error();
    expect(d.uyelikler).toEqual([]);
  });
});

describe('oturumlarim ve kendi oturumunun kapanmasi', () => {
  async function kur() {
    const depo = bellekBelirtecDeposu();
    const adaptorler = mockAdaptorler(depo, 0);
    const temizle = jest.fn();
    const oturum = oturumYoneticisiOlustur({ adaptorler, temizle });
    await adaptorler.auth.otpDogrula('+905551110001', '123456');
    await oturum.girisTamamlandi();
    return { adaptorler, oturum, depo, temizle };
  }

  it('liste bu oturumu isaretler; baska oturum sonlandirilinca giris acik kalir', async () => {
    const { adaptorler, depo } = await kur();
    const liste = await adaptorler.hesap.oturumlar();
    expect(liste.filter((o) => o.buOturum)).toHaveLength(1);
    const baska = gerekli(liste.find((o) => !o.buOturum));
    const r = await adaptorler.hesap.oturumSonlandir(baska.id, false);
    expect(r.kendiOturumuKapandi).toBe(false);
    expect((await adaptorler.hesap.oturumlar()).map((o) => o.id)).not.toContain(baska.id);
    expect(await depo.oku()).not.toBeNull();
  });

  it('diger oturumlari kapat: yalniz bu oturum kalir', async () => {
    const { adaptorler, depo } = await kur();
    const r = await adaptorler.hesap.oturumlariKapat(true);
    expect(r).toEqual({ kapatilan: 2, kendiOturumuKapandi: false });
    expect((await adaptorler.hesap.oturumlar()).every((o) => o.buOturum)).toBe(true);
    expect(await depo.oku()).not.toBeNull();
  });

  it('kendi oturumunu sonlandirinca belirtec silinir ve yonetici giris ekranina doner', async () => {
    const { adaptorler, oturum, depo, temizle } = await kur();
    const bu = gerekli((await adaptorler.hesap.oturumlar()).find((o) => o.buOturum));
    const r = await adaptorler.hesap.oturumSonlandir(bu.id, true);
    expect(r.kendiOturumuKapandi).toBe(true);
    expect(await depo.oku()).toBeNull();
    oturum.kendiOturumuKapandi();
    expect(oturum.depo.al().asama).toBe('cikis');
    expect(temizle).toHaveBeenCalled();
  });

  it('hepsini kapat: belirtec silinir, yonetici cikis durumuna gecer', async () => {
    const { adaptorler, oturum, depo } = await kur();
    const r = await adaptorler.hesap.oturumlariKapat(false);
    expect(r.kendiOturumuKapandi).toBe(true);
    expect(await depo.oku()).toBeNull();
    oturum.kendiOturumuKapandi();
    expect(oturum.depo.al().asama).toBe('cikis');
  });

  it('sonlandirilan oturumun belirteciyle gelen 401 de oturumu kapatir (hataIsle)', async () => {
    const { oturum } = await kur();
    oturum.hataIsle(new ApiHata('yetkisiz', undefined, { durum: 401 }));
    expect(oturum.depo.al().asama).toBe('cikis');
  });
});
