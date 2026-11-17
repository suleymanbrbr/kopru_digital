import { mockMotivasyon } from '../api/mockMotivasyon';
import type { MotivasyonAdapter, OdakOturumu } from '../api/motivasyonTipleri';
import { ApiHata } from '../api/tipler';
import { bellekKv, type KvDepo } from '../depo/kv';
import { OfflineKuyruk } from '../offline/kuyruk';
import { ODAK_BASLAT_TURU, ODAK_BITIR_TURU, OdakYoneticisi, type OdakSonucu } from './odak';

const UYELIK = 'uyelik-ogrenci-a';
const T0 = Date.parse('2026-11-12T10:00:00.000Z');

interface Ortam {
  odak: OdakYoneticisi;
  kuyruk: OfflineKuyruk;
  adaptor: MotivasyonAdapter;
  saat: { simdi: number };
  ag: { cevrimici: boolean };
  depo: KvDepo;
  bittiler: { istemciId: string; plan: boolean; sonuc: OdakSonucu }[];
  cagrilar: string[];
  yeniYonetici: () => OdakYoneticisi;
}

function kur(
  sec: { adaptor?: (a: MotivasyonAdapter) => MotivasyonAdapter; depo?: KvDepo } = {},
): Ortam {
  const saat = { simdi: T0 };
  const ag = { cevrimici: true };
  const depo = sec.depo ?? bellekKv();
  const mock = mockMotivasyon({
    bekle: () => Promise.resolve(),
    gecikmeMs: 0,
    oturumGerekli: () => Promise.resolve(),
    aktifUyelikId: () => UYELIK,
    simdi: () => saat.simdi,
  });
  const cagrilar: string[] = [];
  const izle = (ad: 'odakBaslat' | 'odakBitir' | 'odakAcik'): void => {
    const f = mock.adaptor[ad] as (...a: unknown[]) => Promise<unknown>;
    (mock.adaptor as unknown as Record<string, unknown>)[ad] = (...a: unknown[]) => {
      cagrilar.push(ad);
      return f(...a);
    };
  };
  izle('odakBaslat');
  izle('odakBitir');
  izle('odakAcik');
  const adaptor = sec.adaptor ? sec.adaptor(mock.adaptor) : mock.adaptor;
  let n = 0;
  const kuyruk = new OfflineKuyruk({
    depo: bellekKv(),
    yeniId: () => `00000000-0000-7000-8000-${String(++n).padStart(12, '0')}`,
    kapsam: () => UYELIK,
    cevrimiciMi: () => ag.cevrimici,
    simdi: () => saat.simdi,
    gecikme: () => 0,
  });
  const bittiler: Ortam['bittiler'] = [];
  let id = 0;
  const yeniYonetici = () =>
    new OdakYoneticisi({
      depo,
      kuyruk,
      motivasyon: () => adaptor,
      kapsam: () => UYELIK,
      yeniId: () => `00000000-0000-7000-b000-${String(++id).padStart(12, '0')}`,
      cevrimiciMi: () => ag.cevrimici,
      simdi: () => saat.simdi,
      cihaz: 'ios',
      bitti: (yuk, sonuc) => {
        bittiler.push({ istemciId: yuk.istemciId, plan: !!yuk.planGorevi, sonuc });
      },
    });
  return {
    odak: yeniYonetici(),
    kuyruk,
    adaptor,
    saat,
    ag,
    depo,
    bittiler,
    cagrilar,
    yeniYonetici,
  };
}

const dk = (n: number) => n * 60_000;

describe('odak: sure baslangic zamanindan hesaplanir', () => {
  it('ekran kapaliyken de dogru: saat ilerleyince kalan sure ilerler', async () => {
    const o = kur();
    await o.odak.baslat({ mod: '25_5', planlananDk: 25 });
    const s = o.odak.al().oturum!;
    expect(o.odak.kalanSn(s, T0)).toBe(25 * 60);
    expect(o.odak.kalanSn(s, T0 + dk(10) + 5000)).toBe(25 * 60 - 605);
    expect(o.odak.gecenSn(s, T0 + dk(10))).toBe(600);
    expect(o.odak.kalanSn(s, T0 + dk(40))).toBe(0);
    expect(o.odak.gecenSn(s, T0 - 5000)).toBe(0);
  });
});

describe('odak: cevrimici baslat / bitir', () => {
  it('baslat hemen sunucuya gider (kuyruga girmez); bitir kazanimi dondurur', async () => {
    const o = kur();
    await o.odak.baslat({ mod: 'serbest', planlananDk: 10 });
    expect(o.cagrilar).toEqual(['odakBaslat']);
    expect(o.kuyruk.bekleyenler()).toHaveLength(0);
    expect(o.odak.al()).toMatchObject({
      faz: 'calisiyor',
      oturum: { sunucuda: true, mod: 'serbest' },
    });

    o.saat.simdi = T0 + dk(6);
    o.odak.bitir('tamam');
    await o.kuyruk.bosalt();
    const d = o.odak.al();
    expect(d.faz).toBe('bitti');
    expect(d.sonuc).toMatchObject({ durum: 'tamam', gerceklesenSn: 360, hata: false });
    expect(d.sonuc?.kazanim?.xp).toBe(6);
    expect(o.bittiler).toHaveLength(1);
    // yerel kayit temizlendi: yeniden acilista sürdürülecek bir sey yok
    expect(o.depo.getString('kopru.odak.v1')).toBeUndefined();
  });

  it('1 dakikadan kisa oturum XP vermez', async () => {
    const o = kur();
    await o.odak.baslat({ mod: 'serbest', planlananDk: 10 });
    o.saat.simdi = T0 + 30_000;
    o.odak.bitir('yarida');
    await o.kuyruk.bosalt();
    expect(o.odak.al().sonuc?.kazanim?.xp).toBe(0);
  });

  it('plan gorevi secildiyse bitis callback`i gorevi ve yazilacak sureyi bildirir', async () => {
    const o = kur();
    await o.odak.baslat({
      mod: 'serbest',
      planlananDk: 20,
      planGorevi: {
        id: 'g1',
        baslik: 'Matematik',
        gun: '2026-11-12',
        mevcutDk: 10,
        bransKodu: 'matematik',
      },
    });
    o.saat.simdi = T0 + dk(15);
    o.odak.bitir('tamam');
    await o.kuyruk.bosalt();
    expect(o.bittiler[0]).toMatchObject({
      plan: true,
      sonuc: { planYazildi: true, gerceklesenSn: 900 },
    });
  });

  it('bitisAt baslangictan once ya da simdiden sonra olsa da oturum bozulmaz', async () => {
    const o = kur();
    await o.odak.baslat({ mod: 'serbest', planlananDk: 10 });
    o.saat.simdi = T0 + dk(5);
    o.odak.bitir('tamam', new Date(T0 - dk(5)).toISOString());
    await o.kuyruk.bosalt();
    expect(o.odak.al().sonuc?.gerceklesenSn).toBe(0);
  });

  it('ayni anda ikinci baslat yok sayilir', async () => {
    const o = kur();
    await o.odak.baslat({ mod: '25_5', planlananDk: 25 });
    const id = o.odak.al().oturum!.istemciId;
    await o.odak.baslat({ mod: '50_10', planlananDk: 50 });
    expect(o.odak.al().oturum?.istemciId).toBe(id);
    expect(o.cagrilar.filter((c) => c === 'odakBaslat')).toHaveLength(1);
  });
});

describe('odak: cevrimdisi baslat -> bitir sirasi', () => {
  it('cevrimdisi baslat ve bitir kuyruga sirayla girer; baglanti gelince baslat sonra bitir gider', async () => {
    const o = kur();
    o.ag.cevrimici = false;
    await o.odak.baslat({ mod: 'serbest', planlananDk: 10 });
    expect(o.cagrilar).toEqual([]);
    expect(o.kuyruk.bekleyenler().map((i) => i.tur)).toEqual([ODAK_BASLAT_TURU]);
    expect((o.kuyruk.bekleyenler()[0]!.yuk as { baslangicAt: string }).baslangicAt).toBe(
      new Date(T0).toISOString(),
    );

    o.saat.simdi = T0 + dk(7);
    o.odak.bitir('tamam');
    expect(o.kuyruk.bekleyenler().map((i) => i.tur)).toEqual([ODAK_BASLAT_TURU, ODAK_BITIR_TURU]);
    expect((o.kuyruk.bekleyenler()[1]!.yuk as { bitisAt: string }).bitisAt).toBe(
      new Date(T0 + dk(7)).toISOString(),
    );
    expect(o.odak.al().faz).toBe('bitiyor');
    await o.kuyruk.bosalt();
    expect(o.cagrilar).toEqual([]); // hala cevrimdisi

    o.ag.cevrimici = true;
    await o.kuyruk.bosalt();
    expect(o.cagrilar).toEqual(['odakBaslat', 'odakBitir']);
    expect(o.kuyruk.bekleyenler()).toHaveLength(0);
    expect(o.odak.al()).toMatchObject({ faz: 'bitti', sonuc: { gerceklesenSn: 420 } });
    expect(o.odak.al().sonuc?.kazanim?.xp).toBe(7);
  });

  it('baslat ag hatasiyla duserse is `baslangic_at` ile kuyruga alinir ve ayni kimlikle yeniden denenir', async () => {
    let deneme = 0;
    const gorulen: (string | undefined)[] = [];
    const o = kur({
      adaptor: (a) => ({
        ...a,
        odakBaslat: (g) => {
          deneme += 1;
          gorulen.push(g.baslangicAt);
          if (deneme === 1) return Promise.reject(new ApiHata('ag'));
          return a.odakBaslat(g);
        },
      }),
    });
    await o.odak.baslat({ mod: 'serbest', planlananDk: 10 });
    expect(o.odak.al().faz).toBe('calisiyor');
    expect(o.kuyruk.bekleyenler().map((i) => i.tur)).toEqual([ODAK_BASLAT_TURU]);
    await o.kuyruk.bosalt();
    expect(deneme).toBe(2);
    expect(gorulen).toEqual([undefined, new Date(T0).toISOString()]);
    expect(o.odak.al().oturum?.sunucuda).toBe(true);
    expect(o.kuyruk.bekleyenler()).toHaveLength(0);
  });
});

describe('odak: sunucu durumlari', () => {
  it('bitir 404 (baslat hic ulasmamis): once baslat sonra bitir', async () => {
    const o = kur();
    o.ag.cevrimici = false;
    await o.odak.baslat({ mod: 'serbest', planlananDk: 10 });
    o.saat.simdi = T0 + dk(8);
    o.odak.bitir('tamam');
    // baslat isi kuyrukta kayboldu gibi: yalniz bitir kalsin (baslat hic ulasmadi)
    const bitirIsi = o.kuyruk.bekleyenler().find((i) => i.tur === ODAK_BITIR_TURU)!;
    o.kuyruk.sil(o.kuyruk.bekleyenler().find((i) => i.tur === ODAK_BASLAT_TURU)!.istekId);
    expect(o.kuyruk.bekleyenler().map((i) => i.istekId)).toEqual([bitirIsi.istekId]);
    await o.kuyruk.bosalt(); // cevrimdisi: bir sey gitmez
    o.ag.cevrimici = true;
    await o.kuyruk.bosalt();
    expect(o.cagrilar).toEqual(['odakBitir', 'odakBaslat', 'odakBitir']);
    expect(o.odak.al().sonuc?.kazanim?.xp).toBe(8);
  });

  it('409 acik_oturum_var: mevcut acik oturum devralinir', async () => {
    const o = kur();
    // baska cihazdan acik oturum
    const baska = await o.adaptor.odakBaslat({
      istemciId: '00000000-0000-7000-c000-000000000001',
      mod: 'serbest',
      planlananDk: 30,
      baslangicAt: new Date(T0 - dk(4)).toISOString(),
    });
    await o.odak.baslat({ mod: '25_5', planlananDk: 25 });
    const d = o.odak.al();
    expect(d.faz).toBe('calisiyor');
    expect(d.oturum).toMatchObject({
      istemciId: baska.istemci_id,
      devralindi: true,
      sunucuda: true,
      planlananDk: 30,
    });
    expect(o.odak.gecenSn(d.oturum!, T0)).toBe(240);
  });

  it('kalici hata (422): oturum gorunmez ve hata yukari atilir', async () => {
    const o = kur({
      adaptor: (a) => ({
        ...a,
        odakBaslat: () =>
          Promise.reject(
            new ApiHata('dogrulama', undefined, { durum: 422, ayrinti: 'baslangic_gecersiz' }),
          ),
      }),
    });
    await expect(o.odak.baslat({ mod: 'serbest', planlananDk: 10 })).rejects.toMatchObject({
      ayrinti: 'baslangic_gecersiz',
    });
    expect(o.odak.al().faz).toBe('bos');
    expect(o.depo.getString('kopru.odak.v1')).toBeUndefined();
  });

  it('bitis kalici olarak reddedilirse (basarisiz is) sonuc `hata` isaretlenir', async () => {
    const o = kur({
      adaptor: (a) => ({
        ...a,
        odakBitir: () => Promise.reject(new ApiHata('dogrulama', undefined, { durum: 422 })),
      }),
    });
    await o.odak.baslat({ mod: 'serbest', planlananDk: 10 });
    o.saat.simdi = T0 + dk(3);
    o.odak.bitir('tamam');
    await o.kuyruk.bosalt();
    expect(o.odak.al()).toMatchObject({ faz: 'bitti', sonuc: { hata: true } });
    expect(o.kuyruk.basarisizlar()).toHaveLength(1);
  });

  it('yalnizca yerel mod (modul kapali): sunucuya hic gidilmez', async () => {
    const o = kur();
    const y = new OdakYoneticisi({
      depo: bellekKv(),
      kuyruk: o.kuyruk,
      motivasyon: () => o.adaptor,
      kapsam: () => UYELIK,
      yeniId: () => '00000000-0000-7000-b000-0000000000aa',
      cevrimiciMi: () => true,
      sunucu: () => false,
      simdi: () => o.saat.simdi,
    });
    await y.baslat({ mod: 'serbest', planlananDk: 10 });
    o.saat.simdi = T0 + dk(2);
    y.bitir('tamam');
    expect(y.al()).toMatchObject({ faz: 'bitti', sonuc: { gerceklesenSn: 120, kazanim: null } });
    expect(o.cagrilar).toEqual([]);
    expect(o.kuyruk.bekleyenler()).toHaveLength(0);
  });
});

describe('odak: uygulama yeniden acilinca surdurme', () => {
  it('yerel oturum surer; sure baslangictan hesaplanir', async () => {
    const o = kur();
    await o.odak.baslat({ mod: '50_10', planlananDk: 50 });
    const id = o.odak.al().oturum!.istemciId;
    // uygulama olduruldu: yeni yonetici ayni depoyla
    const yeni = o.yeniYonetici();
    expect(yeni.al().faz).toBe('bos');
    o.saat.simdi = T0 + dk(12);
    await yeni.yukle();
    expect(yeni.al()).toMatchObject({ faz: 'calisiyor', oturum: { istemciId: id } });
    expect(yeni.kalanSn(yeni.al().oturum!, o.saat.simdi)).toBe(38 * 60);
  });

  it('baslat sunucuya hic ulasmadiysa acilista is yeniden kuyruga alinir (ayni kimlik)', async () => {
    const o = kur();
    o.ag.cevrimici = false;
    await o.odak.baslat({ mod: 'serbest', planlananDk: 10 });
    const id = o.odak.al().oturum!.istemciId;
    // kuyruk ve yonetici sifirdan kuruluyor: kuyruk isi kalicidir ama burada kaybolmus varsayalim
    o.kuyruk.sil(o.kuyruk.bekleyenler()[0]!.istekId);
    const yeni = o.yeniYonetici();
    await yeni.yukle();
    const is = o.kuyruk.bekleyenler()[0]!;
    expect(is.tur).toBe(ODAK_BASLAT_TURU);
    expect((is.yuk as { istemciId: string }).istemciId).toBe(id);
    expect(is.istekId).toBe(`odak-baslat-${id}`);
    // ayni istekId ile tekrar acilista cift is olusmaz
    await o.yeniYonetici().yukle();
    expect(o.kuyruk.bekleyenler()).toHaveLength(1);
  });

  it('yerel kayit yoksa sunucudaki acik oturum devralinir; bekleyen bitis isi varsa devralinmaz', async () => {
    const o = kur();
    await o.adaptor.odakBaslat({
      istemciId: '00000000-0000-7000-c000-000000000009',
      mod: 'serbest',
      planlananDk: 20,
      baslangicAt: new Date(T0 - dk(3)).toISOString(),
    });
    const yeni = o.yeniYonetici();
    await yeni.yukle();
    expect(yeni.al()).toMatchObject({ faz: 'calisiyor', oturum: { devralindi: true } });

    // bekleyen bitis isi: sunucudaki "acik" oturum aslinda biz bitirmek uzereyiz
    const o2 = kur();
    const a = await o2.adaptor.odakBaslat({
      istemciId: '00000000-0000-7000-c000-00000000000a',
      mod: 'serbest',
      planlananDk: 20,
    });
    o2.kuyruk.ekle(ODAK_BITIR_TURU, { istemciId: a.istemci_id });
    const y2 = o2.yeniYonetici();
    await y2.yukle();
    expect(y2.al().faz).toBe('bos');
  });

  it('baska kullanicinin (kapsamin) yerel oturumu gosterilmez', async () => {
    const o = kur();
    await o.odak.baslat({ mod: 'serbest', planlananDk: 10 });
    const baska = new OdakYoneticisi({
      depo: o.depo,
      kuyruk: o.kuyruk,
      motivasyon: () => o.adaptor,
      kapsam: () => 'uyelik-ogrenci-baska',
      yeniId: () => 'x',
      cevrimiciMi: () => false,
    });
    await baska.yukle();
    expect(baska.al().faz).toBe('bos');
  });
});

describe('odak: mock sunucu davranisi', () => {
  it('baslat idempotent: ayni istemci_id ayni oturumu doner', async () => {
    const o = kur();
    const g = {
      istemciId: '00000000-0000-7000-c000-00000000000b',
      mod: 'serbest' as const,
      planlananDk: 10,
    };
    const a: OdakOturumu = await o.adaptor.odakBaslat(g);
    const b = await o.adaptor.odakBaslat(g);
    expect(b.id).toBe(a.id);
  });
});
