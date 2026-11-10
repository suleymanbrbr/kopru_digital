import type { DenemeGelisimi, Konu, OgrenciOdevi, PlanGorevi } from '../api/ogrenmeTipleri';
import { bellekKv } from '../depo/kv';
import { bugunTarihi } from '../lib/saat';
import { bolumSerisi, cizgiGrafigiHazirla, grafikOzeti, toplamSerisi } from './grafik';
import {
  gorevDurumuHesapla,
  gorevOrani,
  gorevSayilari,
  gunGorevleri,
  haftaBaslangici,
  haftaEtiketi,
  haftaGunleri,
  haftaKaydir,
  haftaOzeti,
  tarihMetni,
} from './hafta';
import {
  aramaAnahtari,
  bransAdi,
  bransListesi,
  konuAgaci,
  konuEtiketi,
  sonKonuEkle,
  sonKonulariOku,
  sonKonular,
  SON_KONU_SAYISI,
} from './konu';
import { bolumKur, netBicimle, netHesapla } from './net';
import {
  odevBasligiOner,
  odevGecikmisMi,
  odevleriBol,
  teslimKur,
  varsayilanSonTeslim,
} from './odev';
import { bolumGelisimiOrnegi } from './testVerisi';

describe('net onizlemesi', () => {
  it('LGS (0,3333): 20 dogru 3 yanlis -> 19,00; 1 yanlis -> 19,67', () => {
    expect(netHesapla(20, 3, 0.3333)).toBe(19);
    expect(netBicimle(netHesapla(20, 3, 0.3333))).toBe('19,00');
    expect(netHesapla(20, 1, 0.3333)).toBe(19.67);
    expect(netBicimle(netHesapla(20, 1, 0.3333))).toBe('19,67');
  });

  it('TYT (0,25): 40 dogru 4 yanlis -> 39,00', () => {
    expect(netHesapla(40, 4, 0.25)).toBe(39);
    expect(netBicimle(39)).toBe('39,00');
  });

  const bolum = { bolumKodu: 'matematik', soruSayisi: 40 };

  it('bos yazilmazsa hesaplanir', () => {
    const s = bolumKur(bolum, '36', '4', '', 0.25);
    expect(s).toMatchObject({ ok: true, bos: 0, net: 35 });
    const t = bolumKur(bolum, '30', '', '', 0.25);
    expect(t).toMatchObject({ ok: true, bos: 10, net: 30 });
    expect(bolumKur(bolum, '', '', '', 0.25)).toMatchObject({ ok: true, bos: 40, net: 0 });
  });

  it('toplam = soru sayisi dogrulamasi: asim ve tutmayan bos', () => {
    expect(bolumKur(bolum, '30', '11', '', 0.25)).toEqual({ ok: false, hata: 'asim' });
    expect(bolumKur(bolum, '30', '5', '4', 0.25)).toEqual({ ok: false, hata: 'toplam' });
    expect(bolumKur(bolum, '30', '5', '5', 0.25)).toMatchObject({ ok: true });
    expect(bolumKur(bolum, 'x', '', '', 0.25)).toEqual({ ok: false, hata: 'gecersiz' });
    expect(bolumKur(bolum, '-1', '', '', 0.25)).toEqual({ ok: false, hata: 'gecersiz' });
  });
});

describe('hafta yardimcilari', () => {
  it('hafta Pazartesi baslar, 7 gun', () => {
    // 2026-11-09 Pazartesi
    expect(haftaBaslangici('2026-11-09')).toBe('2026-11-09');
    expect(haftaBaslangici('2026-11-12')).toBe('2026-11-09');
    expect(haftaBaslangici('2026-11-15')).toBe('2026-11-09'); // Pazar
    expect(haftaBaslangici('2026-11-16')).toBe('2026-11-16');
    expect(haftaGunleri('2026-11-12')).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ]);
    expect(haftaKaydir('2026-11-12', 1)).toBe('2026-11-16');
    expect(haftaKaydir('2026-11-12', -2)).toBe('2026-10-26');
  });

  it('ay ve yil sinirlarini asar', () => {
    expect(haftaBaslangici('2027-01-01')).toBe('2026-12-28');
    expect(haftaGunleri('2027-01-01')[6]).toBe('2027-01-03');
  });

  it('etiketler Turkce (cihaz saat dilimine bagli degil)', () => {
    expect(haftaEtiketi('2026-11-12')).toBe('9 – 15 Kasım');
    expect(haftaEtiketi('2026-10-28')).toBe('26 Ekim – 1 Kasım');
    expect(tarihMetni('2026-11-09')).toBe('9 Kasım 2026');
  });

  it('bugun kurum saat dilimine gore: 22:30 UTC ertesi gun (Istanbul)', () => {
    const an = Date.UTC(2026, 10, 9, 22, 30); // 9 Kasim 22:30 UTC = 10 Kasim 01:30 Istanbul
    expect(bugunTarihi('Europe/Istanbul', an)).toBe('2026-11-10');
    expect(bugunTarihi('UTC', an)).toBe('2026-11-09');
    // Pazar -> Pazartesi gecisi: hafta degisir
    const pazarGecesi = Date.UTC(2026, 10, 15, 21, 30); // Istanbul Pazartesi 00:30
    expect(haftaBaslangici(bugunTarihi('Europe/Istanbul', pazarGecesi))).toBe('2026-11-16');
    expect(haftaBaslangici(bugunTarihi('UTC', pazarGecesi))).toBe('2026-11-09');
  });

  const g = (ek: Partial<PlanGorevi>): PlanGorevi => ({
    id: 'g',
    planId: 'p',
    ogrenciId: 'o',
    haftaBaslangic: '2026-11-09',
    gun: '2026-11-10',
    bransKodu: 'matematik',
    konuId: null,
    baslik: null,
    hedefTuru: 'soru',
    hedefMiktar: 20,
    gerceklesen: null,
    durum: 'bekliyor',
    devredenGorevId: null,
    sira: 0,
    surum: 1,
    ...ek,
  });

  it('gun gorevleri sira ile; sayilar devredilenleri saymaz; durum kurali', () => {
    const liste = [
      g({ id: 'b', sira: 1 }),
      g({ id: 'a', sira: 0 }),
      g({ id: 'c', gun: '2026-11-11' }),
      g({ id: 'd', durum: 'devredildi' }),
      g({ id: 'e', durum: 'tamam', sira: 2 }),
    ];
    expect(gunGorevleri(liste, '2026-11-10').map((x) => x.id)).toEqual(['a', 'd', 'b', 'e']);
    expect(gorevSayilari(gunGorevleri(liste, '2026-11-10'))).toEqual({ toplam: 3, tamam: 1 });
    expect(gorevDurumuHesapla(20, 20)).toBe('tamam');
    expect(gorevDurumuHesapla(20, 25)).toBe('tamam');
    expect(gorevDurumuHesapla(20, 5)).toBe('kismen');
    expect(gorevDurumuHesapla(20, 0)).toBe('yapilmadi');
    expect(gorevOrani(g({ gerceklesen: 10 }))).toBe(0.5);
    expect(gorevOrani(g({ gerceklesen: 40 }))).toBe(1);
    expect(
      haftaOzeti([
        g({ gerceklesen: 12 }),
        g({ hedefTuru: 'dakika', hedefMiktar: 30, gerceklesen: 30 }),
        g({ durum: 'devredildi', gerceklesen: 5 }),
      ]),
    ).toEqual({
      soru: { planlanan: 20, gerceklesen: 12 },
      dakika: { planlanan: 30, gerceklesen: 30 },
    });
  });
});

describe('konu secici', () => {
  const k = (id: string, ad: string, ek: Partial<Konu> = {}): Konu => ({
    id,
    bransKodu: 'matematik',
    ustId: null,
    seviye: 'unite',
    ad,
    sira: 1,
    sinifSeviyesi: 8,
    global: true,
    kullanimdanKalkti: false,
    ...ek,
  });
  const konular: Konu[] = [
    k('u1', 'Sayılar'),
    k('k1', 'Üslü Sayılar', { ustId: 'u1', seviye: 'konu', sira: 1 }),
    k('k2', 'Kareköklü Sayılar', { ustId: 'u1', seviye: 'konu', sira: 2 }),
    k('k3', 'Eski Konu', { ustId: 'u1', seviye: 'konu', sira: 3, kullanimdanKalkti: true }),
    k('f1', 'Işık ve Ses', { bransKodu: 'fen_bilimleri' }),
    k('f2', 'Işığın Yayılması', { bransKodu: 'fen_bilimleri', ustId: 'f1', seviye: 'konu' }),
    k('t1', 'İsim', { bransKodu: 'turkce' }),
  ];

  it('arama anahtari Turkce harf duyarsiz', () => {
    expect(aramaAnahtari('Işık')).toBe('isik');
    expect(aramaAnahtari('IŞIK')).toBe('isik');
    expect(aramaAnahtari('İŞİK')).toBe('isik');
    expect(aramaAnahtari('ışık')).toBe('isik');
    expect(aramaAnahtari('Çğöşü')).toBe('cgosu');
  });

  it('unite > konu agaci, girintili ve siralidir; kalkan konu sunulmaz', () => {
    const satirlar = konuAgaci(konular, { bransKodu: 'matematik' });
    expect(satirlar.map((s) => [s.konu.id, s.derinlik])).toEqual([
      ['u1', 0],
      ['k1', 1],
      ['k2', 1],
    ]);
    expect(konuAgaci(konular, { bransKodu: 'matematik', kalkanlariGoster: true })).toHaveLength(4);
  });

  it('arama: eslesen konu, ustleri ve altlari gelir', () => {
    expect(konuAgaci(konular, { arama: 'ISIK' }).map((s) => s.konu.id)).toEqual(['f1', 'f2']);
    expect(konuAgaci(konular, { arama: 'isig' }).map((s) => s.konu.id)).toEqual(['f1', 'f2']);
    expect(konuAgaci(konular, { arama: 'uslu' }).map((s) => s.konu.id)).toEqual(['u1', 'k1']);
    expect(konuAgaci(konular, { arama: 'isim' }).map((s) => s.konu.id)).toEqual(['t1']); // İsim
    expect(konuAgaci(konular, { arama: 'yokboyle' })).toEqual([]);
  });

  it('branslar Turkce siralanir ve adlandirilir', () => {
    expect(bransListesi(konular).map((b) => b.ad)).toEqual([
      'Fen bilimleri',
      'Matematik',
      'Türkçe',
    ]);
    expect(bransAdi('din_kulturu')).toBe('Din kültürü');
    expect(bransAdi('yeni_ders')).toBe('Yeni ders');
  });

  it('kullanimdan kalkan mevcut secim rozetli gosterilir', () => {
    expect(konuEtiketi({ ad: 'Eski Konu', kullanimdanKalkti: true })).toBe(
      'Eski Konu (kullanımdan kalktı)',
    );
    expect(konuEtiketi({ ad: 'Üslü', kullanimdanKalkti: false })).toBe('Üslü');
  });

  it('son kullanilanlar yerel, tekrarsiz, en yeni basta, sinirli', () => {
    const depo = bellekKv();
    expect(sonKonulariOku(depo, 'u')).toEqual([]);
    sonKonuEkle(depo, 'u', 'k1');
    sonKonuEkle(depo, 'u', 'k2');
    expect(sonKonuEkle(depo, 'u', 'k1')).toEqual(['k1', 'k2']);
    expect(sonKonulariOku(depo, 'baska')).toEqual([]);
    for (let i = 0; i < 20; i++) sonKonuEkle(depo, 'u', `x${String(i)}`);
    expect(sonKonulariOku(depo, 'u')).toHaveLength(SON_KONU_SAYISI);
    expect(sonKonulariOku(depo, 'u')[0]).toBe('x19');
    // bozuk icerik ekrani bozmaz
    depo.set('kopru.son-konular.u', '{bozuk');
    expect(sonKonulariOku(depo, 'u')).toEqual([]);
    // kalkan/silinen konular son listesinden dusulur; brans suzgeci uygulanir
    expect(sonKonular(konular, ['k3', 'k1', 'yok', 'f2'], null).map((x) => x.id)).toEqual([
      'k1',
      'f2',
    ]);
    expect(sonKonular(konular, ['k1', 'f2'], 'matematik').map((x) => x.id)).toEqual(['k1']);
  });
});

describe('grafik', () => {
  const g: DenemeGelisimi = bolumGelisimiOrnegi();

  it('seriler ve cizgi koordinatlari', () => {
    expect(toplamSerisi(g).map((s) => s.deger)).toEqual([60, 70, 80]);
    expect(bolumSerisi(g, 'matematik').map((s) => s.deger)).toEqual([20, 25, 30]);
    const c = cizgiGrafigiHazirla([60, 70, 80], 300, 160, 16);
    expect(c.noktalar).toHaveLength(3);
    expect(c.noktalar[0]).toEqual({ x: 16, y: 160 - 16 });
    expect(c.noktalar[2]).toEqual({ x: 284, y: 16 });
    expect(c.yol.startsWith('M16.0 144.0 L')).toBe(true);
    expect(cizgiGrafigiHazirla([], 300, 160).noktalar).toEqual([]);
    // tek nokta ortalanir; esit degerler yatay
    expect(cizgiGrafigiHazirla([5], 300, 160).noktalar[0]).toEqual({ x: 150, y: 80 });
    expect(cizgiGrafigiHazirla([5, 5], 300, 160).noktalar.map((n) => n.y)).toEqual([80, 80]);
  });

  it('ekran okuyucu icin metin ozeti', () => {
    const toplam = grafikOzeti(g, null);
    expect(toplam).toContain('Toplam net grafiği');
    expect(toplam).toContain('3 deneme');
    expect(toplam).toContain('İlk deneme 60,00, son deneme 80,00');
    expect(toplam).toContain('En yüksek 80,00');
    expect(toplam).toContain('Son 5 deneme ortalaması 70,00');
    expect(toplam).toContain('öncekine göre 5,00 artış');
    const bolum = grafikOzeti(g, 'matematik');
    expect(bolum).toContain('Matematik neti grafiği');
    expect(bolum).toContain('İlk deneme 20,00, son deneme 30,00');
    expect(grafikOzeti({ ...g, noktalar: [] }, null)).toContain('Henüz onaylı deneme yok');
    expect(grafikOzeti({ ...g, degisim: -2 }, null)).toContain('öncekine göre 2,00 düşüş');
  });
});

describe('odev yardimcilari', () => {
  const simdi = Date.UTC(2026, 10, 10, 12);
  const o = (ek: Partial<OgrenciOdevi>): OgrenciOdevi => ({
    id: 'o',
    odevId: 'od',
    baslik: 'B',
    aciklama: null,
    bransKodu: 'matematik',
    konuId: null,
    tur: 'soru',
    kaynak: null,
    hedefSoruSayisi: 20,
    durum: 'atandi',
    sonTeslim: new Date(simdi + 86_400_000).toISOString(),
    yapilanSoru: null,
    dogru: null,
    yanlis: null,
    bos: null,
    ogrenciNotu: null,
    teslimAt: null,
    gecTeslim: false,
    incelemeSonucu: null,
    incelemeNotu: null,
    ...ek,
  });

  it('geciken / yaklasan / teslim edilen ayrimi ve sirasi', () => {
    const gecmis = new Date(simdi - 3_600_000).toISOString();
    const yakin = new Date(simdi + 3_600_000).toISOString();
    const uzak = new Date(simdi + 5 * 86_400_000).toISOString();
    const b = odevleriBol(
      [
        o({ id: 'uzak', sonTeslim: uzak }),
        o({ id: 'gec', sonTeslim: gecmis }),
        o({ id: 'yakin', sonTeslim: yakin }),
        o({ id: 'tekrar', durum: 'tekrar_istendi', sonTeslim: gecmis }),
        o({ id: 'inc', durum: 'incelendi', teslimAt: gecmis }),
        o({ id: 'iptal', durum: 'iptal' }),
      ],
      simdi,
    );
    expect(b.geciken.map((x) => x.id)).toEqual(['gec', 'tekrar']);
    expect(b.yaklasan.map((x) => x.id)).toEqual(['yakin', 'uzak']);
    expect(b.teslimEdilen.map((x) => x.id)).toEqual(['inc']);
    expect(odevGecikmisMi(o({ durum: 'incelendi', sonTeslim: gecmis }), simdi)).toBe(false);
    expect(odevGecikmisMi(o({ sonTeslim: null }), simdi)).toBe(false);
  });

  it('varsayilan teslim kurum saat diliminde 23:59', () => {
    expect(varsayilanSonTeslim('2026-11-10', 'Europe/Istanbul', 3)).toBe(
      '2026-11-13T20:59:00.000Z',
    );
    expect(varsayilanSonTeslim('2026-11-10', 'UTC', 1)).toBe('2026-11-11T23:59:00.000Z');
  });

  it('baslik onerisi', () => {
    expect(odevBasligiOner('Üslü Sayılar', 'soru', 20)).toBe('Üslü Sayılar: 20 soru');
    expect(odevBasligiOner('Paragraf', 'sayfa', 12)).toBe('Paragraf: 12 sayfa');
    expect(odevBasligiOner('Serbest', 'serbest', null)).toBe('Serbest');
  });

  it('teslim girdisi: yapilan zorunlu, bos hesaplanir, toplam dogrulanir', () => {
    expect(teslimKur('', '', '', '', '')).toEqual({ ok: false, hata: 'yapilan' });
    expect(teslimKur('x', '', '', '', '')).toEqual({ ok: false, hata: 'gecersiz' });
    expect(teslimKur('20', '', '', '', '')).toEqual({ ok: true, girdi: { yapilanSoru: 20 } });
    expect(teslimKur('20', '15', '3', '', ' Zordu ')).toEqual({
      ok: true,
      girdi: { yapilanSoru: 20, dogru: 15, yanlis: 3, bos: 2, not: 'Zordu' },
    });
    expect(teslimKur('20', '15', '4', '2', '')).toEqual({ ok: false, hata: 'asim' });
    expect(teslimKur('20', '15', '3', '1', '')).toEqual({ ok: false, hata: 'toplam' });
    expect(teslimKur('20', '25', '', '', '')).toEqual({ ok: false, hata: 'asim' });
  });
});
