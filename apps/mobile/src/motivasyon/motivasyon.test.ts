/* eslint-disable @typescript-eslint/no-non-null-assertion -- testlerde tohum verisi varligi dogrudan varsayilir */
import type { MotivasyonDurumu, SeriDetayi } from '../api/motivasyonTipleri';
import { bellekKv } from '../depo/kv';
import { adimlariPlanla, EVRIM_ENFAZLA_MS } from './adimlar';
import {
  noktalarMetni,
  radarCokgeni,
  radarHalkasi,
  radarMetni,
  radarNoktasi,
  radarOlcegi,
} from './radar';
import { gunFarki, ruhHaliSec } from './ruhHali';
import {
  enYakinHedef,
  gunDurumuEtiketi,
  haftaGunu,
  hedefIlerlemeMetni,
  kilometreTasiMetni,
  seriBasligi,
  seriDurumMetni,
  takvimOzeti,
  takvimSatirlari,
} from './seriMetni';
import { VITRIN_ENFAZLA, vitrinDegistir, vitrinOku } from './vitrin';
import { seviyeOrani, xpFarki } from './xpFarki';
import { XpYoneticisi, type XpOlayi } from './xpYonetici';

function durum(d: Partial<MotivasyonDurumu> = {}): MotivasyonDurumu {
  return {
    ogrenci_id: '00000000-0000-7000-8000-000000000001',
    toplam_xp: 100,
    seviye: 3,
    seviye_baslangic_xp: 60,
    sonraki_seviye_xp: 160,
    sonraki_seviyeye_kalan: 60,
    bu_hafta_xp: 100,
    bugun: { gun: '2026-11-12', xp: 0, tavanlar: [] },
    beceriler: [],
    rozetler: { kazanilan: [], kilitli: [] },
    karakter: {
      tur_kodu: 'kivilcim',
      ad: 'Közü',
      asama: 1,
      sonraki_asama_seviyesi: 5,
      kusanilanlar: [],
    },
    seri: {
      mevcut_seri: 0,
      en_uzun_seri: 0,
      son_aktif_gun: null,
      dondurma_stogu: 0,
      onarim_hakki: 0,
      bozulan_seri: null,
      bozulan_gun: null,
      onarim_bitis_at: null,
    },
    son_hareketler: [],
    ...d,
  };
}

const rozet = (kod: string, ad: string) => ({
  kod,
  ad,
  aciklama: '',
  kategori: 'emek' as const,
  kademe: 'bronz' as const,
  kazanildi_at: '2026-11-01T10:00:00.000Z',
});

describe('ruh hali secimi', () => {
  const taban = { odakta: false, kutlama: false, bugun: '2026-11-12', sonAktifGun: null };

  it('odak sirasinda odak, kutlama her seyin ustunde', () => {
    expect(ruhHaliSec({ ...taban, odakta: true, sonAktifGun: '2026-11-12' })).toBe('odak');
    expect(ruhHaliSec({ ...taban, odakta: true, kutlama: true })).toBe('kutlama');
  });

  it('bugun aktifse mutlu (son aktif gun ya da bugunku XP)', () => {
    expect(ruhHaliSec({ ...taban, sonAktifGun: '2026-11-12' })).toBe('mutlu');
    expect(ruhHaliSec({ ...taban, sonAktifGun: '2026-11-09', bugunXp: 10 })).toBe('mutlu');
  });

  it('2+ gun aktivite yoksa uykulu, dun aktifse normal', () => {
    expect(ruhHaliSec({ ...taban, sonAktifGun: '2026-11-10' })).toBe('uykulu');
    expect(ruhHaliSec({ ...taban, sonAktifGun: '2026-11-01' })).toBe('uykulu');
    expect(ruhHaliSec({ ...taban, sonAktifGun: '2026-11-11' })).toBe('normal');
  });

  it('hic aktivitesi olmayan yeni ogrenci uykulu degil normal', () => {
    expect(ruhHaliSec(taban)).toBe('normal');
  });

  it('gun farki ay ve yil sinirinda dogru', () => {
    expect(gunFarki('2026-10-31', '2026-11-02')).toBe(2);
    expect(gunFarki('2025-12-31', '2026-01-01')).toBe(1);
  });
});

describe('XP farki ve kutlama tetikleme', () => {
  it('XP artisi: yalniz "+N XP"', () => {
    const f = xpFarki(durum(), durum({ toplam_xp: 115 }));
    expect(f).toMatchObject({ xp: 15, seviyeAtladi: false, evrim: false, yeniRozetler: [] });
  });

  it('degisim yoksa ya da ters kayit varsa null (kutlama yok)', () => {
    expect(xpFarki(durum(), durum())).toBeNull();
    expect(xpFarki(durum(), durum({ toplam_xp: 90 }))).toBeNull();
  });

  it('seviye atlama', () => {
    const f = xpFarki(durum(), durum({ toplam_xp: 170, seviye: 4 }));
    expect(f).toMatchObject({
      xp: 70,
      seviyeAtladi: true,
      eskiSeviye: 3,
      yeniSeviye: 4,
      evrim: false,
    });
  });

  it('asama yukselince evrim', () => {
    const yeni = durum({
      toplam_xp: 400,
      seviye: 5,
      karakter: {
        tur_kodu: 'kivilcim',
        ad: 'Közü',
        asama: 2,
        sonraki_asama_seviyesi: 12,
        kusanilanlar: [],
      },
    });
    expect(xpFarki(durum(), yeni)).toMatchObject({ evrim: true, eskiAsama: 1, yeniAsama: 2 });
  });

  it('yeni rozet adlari; zaten sahip olunan sayilmaz', () => {
    const once = durum({ rozetler: { kazanilan: [rozet('a', 'A')], kilitli: [] } });
    const sonra = durum({
      toplam_xp: 105,
      rozetler: { kazanilan: [rozet('a', 'A'), rozet('b', 'Meraklı')], kilitli: [] },
    });
    expect(xpFarki(once, sonra)?.yeniRozetler).toEqual(['Meraklı']);
  });

  it('adim plani: xp -> seviye -> rozet; evrim seviye kartinin yerine gecer ve <= 4 sn', () => {
    const f = xpFarki(
      durum({ rozetler: { kazanilan: [], kilitli: [] } }),
      durum({
        toplam_xp: 400,
        seviye: 5,
        karakter: {
          tur_kodu: 'kivilcim',
          ad: 'Közü',
          asama: 2,
          sonraki_asama_seviyesi: 12,
          kusanilanlar: [],
        },
        rozetler: { kazanilan: [rozet('b', 'B')], kilitli: [] },
      }),
    );
    if (!f) throw new Error('fark bekleniyordu');
    const adimlar = adimlariPlanla(f);
    expect(adimlar.map((a) => a.tur)).toEqual(['xp', 'evrim', 'rozet']);
    expect(adimlar.find((a) => a.tur === 'evrim')?.sureMs).toBeLessThanOrEqual(EVRIM_ENFAZLA_MS);
    expect(EVRIM_ENFAZLA_MS).toBeLessThanOrEqual(4000);
    const yalnizSeviye = xpFarki(durum(), durum({ toplam_xp: 170, seviye: 4 }));
    expect(adimlariPlanla(yalnizSeviye!).map((a) => a.tur)).toEqual(['xp', 'seviye']);
  });

  it('seviye orani sinirlari', () => {
    expect(seviyeOrani(durum({ toplam_xp: 110 }))).toBeCloseTo(0.5);
    expect(seviyeOrani(durum({ sonraki_seviye_xp: null }))).toBe(1);
  });
});

describe('XpYoneticisi', () => {
  const bekle = () => Promise.resolve();

  it('eylemden sonra farki bulur ve dinleyiciye "+N XP" verir', async () => {
    const yanitlar = [durum({ toplam_xp: 100 }), durum({ toplam_xp: 115 })];
    let n = 0;
    const olaylar: XpOlayi[] = [];
    const y = new XpYoneticisi({
      getir: () => Promise.resolve(yanitlar[Math.min(n++, 1)]!),
      etkin: () => true,
      gecikmeler: [0, 0],
      bekle,
    });
    y.abone((o) => olaylar.push(o));
    y.gozlemle(durum({ toplam_xp: 100 }));
    await y.eylemTamam();
    expect(olaylar).toHaveLength(1);
    expect(olaylar[0]?.fark.xp).toBe(15);
    expect(n).toBe(2);
  });

  it('degisim gelmezse olay yok; taban yoksa ilk okuma tabani kurar', async () => {
    const olaylar: XpOlayi[] = [];
    const y = new XpYoneticisi({
      getir: () => Promise.resolve(durum({ toplam_xp: 100 })),
      etkin: () => true,
      gecikmeler: [0, 0],
      bekle,
    });
    y.abone((o) => olaylar.push(o));
    await y.eylemTamam(); // taban yok
    y.gozlemle(durum({ toplam_xp: 100 }));
    await y.eylemTamam(); // degisim yok
    expect(olaylar).toHaveLength(0);
  });

  it('etkin degilse (ogrenci degil / modul kapali) hic istek yapmaz', async () => {
    const getir = jest.fn(() => Promise.resolve(durum()));
    const y = new XpYoneticisi({ getir, etkin: () => false, gecikmeler: [0], bekle });
    await y.eylemTamam();
    expect(getir).not.toHaveBeenCalled();
  });

  it('gecici okuma hatasinda sonraki denemeyle devam eder; sifirla bekleyeni atar', async () => {
    let n = 0;
    const olaylar: XpOlayi[] = [];
    const y = new XpYoneticisi({
      getir: () => {
        n += 1;
        return n === 1
          ? Promise.reject(new Error('ag'))
          : Promise.resolve(durum({ toplam_xp: 120 }));
      },
      etkin: () => true,
      gecikmeler: [0, 0],
      bekle,
    });
    y.abone((o) => olaylar.push(o));
    y.gozlemle(durum());
    await y.eylemTamam();
    expect(olaylar).toHaveLength(1);
    y.sifirla();
    olaylar.length = 0;
    await y.eylemTamam(); // taban yok: yalniz taban kurar
    expect(olaylar).toHaveLength(0);
  });

  it('ardisik eylemler birlestirilir: ikinci eylem de taze durumla karsilastirilir', async () => {
    const seri = [105, 130];
    let n = 0;
    const olaylar: XpOlayi[] = [];
    const y = new XpYoneticisi({
      getir: () => Promise.resolve(durum({ toplam_xp: seri[Math.min(n++, 1)]! })),
      etkin: () => true,
      gecikmeler: [0],
      bekle,
    });
    y.abone((o) => olaylar.push(o));
    y.gozlemle(durum({ toplam_xp: 100 }));
    const a = y.eylemTamam();
    const b = y.eylemTamam();
    await Promise.all([a, b]);
    expect(olaylar.map((o) => o.fark.xp)).toEqual([5, 25]);
  });
});

describe('beceri grafigi (besgen) donusumu', () => {
  const b = [
    { kod: 'sayisal', ad: 'Sayısal', puan: 10 },
    { kod: 'sozel', ad: 'Sözel', puan: 5 },
    { kod: 'fen', ad: 'Fen', puan: 0 },
    { kod: 'sosyal', ad: 'Sosyal', puan: 10 },
    { kod: 'dil', ad: 'Dil', puan: 2 },
  ];

  it('olcek en az 10, en yuksek puana gore 10un kati', () => {
    expect(radarOlcegi(b)).toBe(10);
    expect(radarOlcegi([{ kod: 'a', ad: 'A', puan: 23 }])).toBe(30);
    expect(radarOlcegi([])).toBe(10);
  });

  it('ilk tepe ustte; tam puan yaricapta, sifir puan merkezde', () => {
    const p = radarCokgeni(b, 100, 80);
    expect(p).toHaveLength(5);
    expect(p[0]!.x).toBeCloseTo(100);
    expect(p[0]!.y).toBeCloseTo(20); // merkez - yaricap
    expect(p[2]!.x).toBeCloseTo(100);
    expect(p[2]!.y).toBeCloseTo(100); // puan 0 -> merkez
    // saat yonu: ikinci tepe sag ustte
    expect(p[1]!.x).toBeGreaterThan(100);
    expect(p[1]!.y).toBeLessThan(100);
  });

  it('puan olcegi asarsa yaricapa sikistirilir; halka ve noktalar metni', () => {
    const n = radarNoktasi(0, 5, 3, 100, 80);
    expect(n.y).toBeCloseTo(20);
    expect(radarHalkasi(5, 1, 100, 80)).toHaveLength(5);
    expect(noktalarMetni([{ x: 1.234, y: 2 }])).toBe('1.2,2.0');
  });

  it('metin alternatifi tum becerileri puanlariyla sayar', () => {
    const m = radarMetni(b);
    expect(m).toContain('Sayısal 10');
    expect(m).toContain('Fen 0');
    expect(m).toContain('Dil 2');
  });
});

describe('seri takvimi metinleri', () => {
  function gun(g: string, d: SeriDetayi['gunler'][number]['durum'], bugun = false) {
    return { gun: g, durum: d, bugun };
  }
  const h = (tur: SeriDetayi['hedefler'][number]['tur'], yapilan: number, esik: number) => ({
    tur,
    yapilan,
    esik,
    kalan: Math.max(esik - yapilan, 0),
  });
  const seri = (s: Partial<SeriDetayi> = {}): SeriDetayi => ({
    bugun: '2026-11-12',
    mevcut_seri: 3,
    en_uzun_seri: 7,
    dondurma_stogu: 1,
    onarim_hakki: 1,
    bugun_aktif: false,
    hedefler: [h('plan_gorevi', 2, 3), h('odak_dk', 5, 20)],
    onarim: null,
    sonraki_kilometre_tasi: { hedef: 7, kalan: 4 },
    gunler: [],
    ...s,
  });

  it('en yakin hedef: orani en yuksek olan', () => {
    const y = enYakinHedef(seri().hedefler);
    expect(y?.hedef.tur).toBe('plan_gorevi');
    expect(y?.oran).toBeCloseTo(2 / 3);
    expect(hedefIlerlemeMetni(y!.hedef)).toBe('2/3 plan görevi');
    expect(enYakinHedef([])).toBeNull();
  });

  it('hedef esigi gecince ilerleme esikle sinirli gosterilir', () => {
    expect(hedefIlerlemeMetni(h('odak_dk', 45, 20))).toBe('20/20 dk odak');
  });

  it('basliklar suclamaz: seri yokken "bugun baslayabilirsin"', () => {
    expect(seriBasligi(5)).toBe('5 günlük seri');
    expect(seriBasligi(0)).toBe('Bugün yeni bir seri başlatabilirsin');
  });

  it('durum metni: hedef, tamam ve onarim penceresi', () => {
    expect(seriDurumMetni(seri())).toBe('Bugün için: 3 plan görevi ya da 20 dk odak');
    expect(seriDurumMetni(seri({ bugun_aktif: true }))).toContain('tamam');
    const onarim = seri({
      onarim: {
        bozulan_gun: '2026-11-11',
        bozulan_seri: 8,
        bitis_at: '2026-11-13T01:00:00.000Z',
        hedefler: [h('plan_gorevi', 4, 6), h('odak_dk', 10, 40)],
      },
    });
    const m = seriDurumMetni(onarim);
    expect(m).toContain('Seriyi kurtarmak için bugün 6 plan görevi ya da 40 dk odak');
    expect(m).not.toMatch(/kaçırdın|kaybettin|başarısız/i);
  });

  it('kilometre tasi ve gun etiketleri; "yok" kacirdin demez', () => {
    expect(kilometreTasiMetni(seri())).toBe('Sıradaki durak: 7 gün (4 gün kaldı)');
    expect(kilometreTasiMetni({ sonraki_kilometre_tasi: null })).toBeNull();
    for (const d of ['aktif', 'dondurma', 'duraklatma', 'onarim', 'kacirildi', 'yok'] as const) {
      expect(gunDurumuEtiketi(d)).not.toMatch(/kaçırdın|kaybettin|başarısız/i);
    }
    expect(gunDurumuEtiketi('yok')).toBe('Kayıt yok');
    expect(gunDurumuEtiketi('kacirildi')).toBe('Ara verildi');
  });

  it('takvim satirlari Pazartesi basli haftalara dizilir', () => {
    // 2026-11-12 Persembe; 35 gun geriye: 2026-10-09 (Cuma)
    const gunler: SeriDetayi['gunler'] = [];
    for (let i = 34; i >= 0; i--) {
      const ms = Date.parse('2026-11-12T00:00:00Z') - i * 86_400_000;
      gunler.push(gun(new Date(ms).toISOString().slice(0, 10), i === 0 ? 'aktif' : 'yok', i === 0));
    }
    expect(haftaGunu('2026-10-09')).toBe(4); // Cuma
    const satirlar = takvimSatirlari(gunler);
    expect(satirlar.every((s) => s.length === 7)).toBe(true);
    expect(satirlar[0]!.slice(0, 4).every((x) => x.gun === null)).toBe(true);
    expect(satirlar[0]![4]!.gun).toBe('2026-10-09');
    const dolu = satirlar.flat().filter((x) => x.gun !== null);
    expect(dolu).toHaveLength(35);
    expect(dolu.at(-1)).toMatchObject({
      gun: '2026-11-12',
      bugun: true,
      durum: 'aktif',
      gunNo: 12,
    });
    expect(takvimSatirlari([])).toEqual([]);
  });

  it('takvim ozeti calisilan gunleri sayar', () => {
    const g = [
      gun('2026-11-10', 'aktif'),
      gun('2026-11-11', 'onarim'),
      gun('2026-11-12', 'yok', true),
    ];
    expect(takvimOzeti(g)).toBe('Son 3 günde 2 gün çalıştın.');
  });
});

describe('rozet vitrini (yerel)', () => {
  it('en cok 3 rozet; dolunca ekleme reddedilir, cikarinca yer acilir', () => {
    const kv = bellekKv();
    expect(vitrinOku(kv, 'u1')).toEqual([]);
    for (const k of ['a', 'b', 'c']) expect(vitrinDegistir(kv, 'u1', k).dolu).toBe(false);
    expect(vitrinDegistir(kv, 'u1', 'd')).toEqual({ secim: ['a', 'b', 'c'], dolu: true });
    expect(VITRIN_ENFAZLA).toBe(3);
    expect(vitrinDegistir(kv, 'u1', 'b').secim).toEqual(['a', 'c']);
    expect(vitrinDegistir(kv, 'u1', 'd').secim).toEqual(['a', 'c', 'd']);
  });

  it('uyelik kapsamli ve bozuk veriye dayanikli', () => {
    const kv = bellekKv();
    vitrinDegistir(kv, 'u1', 'a');
    expect(vitrinOku(kv, 'u2')).toEqual([]);
    kv.set('kopru.motivasyon.vitrin.u3', '{bozuk');
    expect(vitrinOku(kv, 'u3')).toEqual([]);
    kv.set('kopru.motivasyon.vitrin.u4', JSON.stringify(['a', 1, 'b', 'c', 'd']));
    expect(vitrinOku(kv, 'u4')).toEqual(['a', 'b', 'c']);
  });
});
