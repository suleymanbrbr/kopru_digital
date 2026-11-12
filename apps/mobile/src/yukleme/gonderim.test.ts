import { mockMedya } from '../api/mockMedya';
import type { SoruAdapter, SoruDetayi, SoruSonucu } from '../api/soruTipleri';
import { ApiHata } from '../api/tipler';
import { bellekKv, type KvDepo } from '../depo/kv';
import { OfflineKuyruk } from '../offline/kuyruk';
import {
  GonderimYoneticisi,
  bekleyenSoruSayisi,
  type DosyaTaslagi,
  type GonderimGovdesi,
} from './gonderim';
import { YuklemeKuyrugu } from './kuyruk';

const detay = { id: 'soru-1' } as unknown as SoruDetayi;
const sonuc: SoruSonucu = {
  soru: detay,
  tekrar: false,
  kota: {
    gunlukLimit: 3,
    gunlukKullanilan: 1,
    gunlukKalan: 2,
    gunlukSifirlanma: '2026-11-13T21:00:00.000Z',
    aylikKalan: null,
    aylikSifirlanma: '2026-12-01T00:00:00.000Z',
  },
  tahmin: { sureSn: 7200, ornekSayisi: 8, hedefMusait: true },
};

function kur(
  ozel: Partial<SoruAdapter> = {},
  secenek: {
    depo?: KvDepo;
    kuyrukDepo?: KvDepo;
    yukleDepo?: KvDepo;
    medya?: ReturnType<typeof mockMedya>;
  } = {},
) {
  const depo = secenek.depo ?? bellekKv();
  const kuyrukDepo = secenek.kuyrukDepo ?? bellekKv();
  const yukleDepo = secenek.yukleDepo ?? bellekKv();
  const medya = secenek.medya ?? mockMedya({ gecikmeMs: 0, isle: 0 });
  let n = 0;
  const yeniId = () => `00000000-0000-7000-8000-${String(++n).padStart(12, '0')}`;
  const adaptor = {
    soruSor: jest.fn(() => Promise.resolve(sonuc)),
    cevapla: jest.fn(() => Promise.resolve(detay)),
    takip: jest.fn(() => Promise.resolve(detay)),
    ...ozel,
  } as unknown as SoruAdapter;
  const cevrimici = { deger: true };
  const kuyruk = new OfflineKuyruk({
    depo: kuyrukDepo,
    yeniId,
    kapsam: () => 'uyelik-1',
    cevrimiciMi: () => cevrimici.deger,
    gecikme: () => 0,
  });
  const yukleme = new YuklemeKuyrugu({
    depo: yukleDepo,
    yeniId,
    kapsam: () => 'uyelik-1',
    medya: () => medya,
    yerel: { kalici: (u) => Promise.resolve(u), sil: () => Promise.resolve() },
    cevrimiciMi: () => cevrimici.deger,
    bekle: () => Promise.resolve(),
    gecikme: () => 0,
  });
  const gonderildi = jest.fn();
  const y = new GonderimYoneticisi({
    depo,
    yeniId,
    kapsam: () => 'uyelik-1',
    yukleme,
    kuyruk,
    soru: () => adaptor,
    gonderildi,
    bekle: () => Promise.resolve(),
    hazirDeneme: { sayi: 3, araMs: 0 },
  });
  return {
    y,
    adaptor,
    kuyruk,
    yukleme,
    medya,
    cevrimici,
    gonderildi,
    depo,
    kuyrukDepo,
    yukleDepo,
    yeniId,
  };
}

async function bitir(o: ReturnType<typeof kur>, tur = 12) {
  for (let i = 0; i < tur; i++) {
    await o.yukleme.calistir();
    o.y.ilerlet();
    await o.kuyruk.bosalt();
  }
}

const foto = (ad: string): DosyaTaslagi => ({
  tur: 'soru_fotografi',
  mimeTipi: 'image/jpeg',
  yerelUri: `file:///cache/${ad}.jpg`,
});

const soruGovdesi: GonderimGovdesi = {
  tur: 'soru',
  bransKodu: 'matematik',
  metin: 'Burada takıldım',
  fotograflar: ['f1', 'f2'],
  isaretler: [{ dosya: 'i1', kaynak: 'f1', cizimVerisi: { v: 1 } }],
};

describe('GonderimYoneticisi', () => {
  it('dosyalar hazir olunca soruyu istek_id ile gonderir ve gonderildi olur', async () => {
    const o = kur();
    const g = await o.y.baslat({
      tur: 'soru',
      baslik: 'Matematik',
      govde: soruGovdesi,
      dosyalar: {
        f1: foto('f1'),
        f2: foto('f2'),
        i1: { tur: 'soru_cizim', mimeTipi: 'image/jpeg', yerelUri: 'file:///cache/i1.jpg' },
      },
    });
    expect(g.durum).toBe('yukleniyor');
    await bitir(o);
    const son = o.y.al(g.id);
    expect(son?.durum).toBe('gonderildi');
    expect(son?.sonuc?.soruId).toBe('soru-1');
    expect(son?.sonuc?.tahmin?.sureSn).toBe(7200);
    expect(son?.sonuc?.kota?.gunlukKalan).toBe(2);
    const cagri = ((o.adaptor.soruSor as jest.Mock).mock.calls as unknown[][])[0]?.[0] as {
      fotograflar: string[];
      isaretler: { dosyaId: string; kaynakDosyaId: string }[];
      istekId: string;
    };
    expect(cagri.istekId).toBe(g.istekId);
    expect(cagri.fotograflar).toHaveLength(2);
    // Isaret, ayni sorunun birinci fotografina baglanir.
    expect(cagri.isaretler[0]?.kaynakDosyaId).toBe(cagri.fotograflar[0]);
    expect(cagri.isaretler[0]?.dosyaId).not.toBe(cagri.fotograflar[0]);
    // Yukleme kayitlari temizlendi; bildirim icin sorgu tazeleme cagrildi.
    expect(o.yukleme.liste()).toHaveLength(0);
    expect(o.gonderildi).toHaveBeenCalledTimes(1);
  });

  it('dosya yuklenirken gonderim yukleniyor kalir, soru istegi atilmaz', async () => {
    const o = kur();
    o.cevrimici.deger = false;
    const g = await o.y.baslat({
      tur: 'soru',
      baslik: 'Matematik',
      govde: { tur: 'soru', bransKodu: 'matematik', fotograflar: ['f1'] },
      dosyalar: { f1: foto('f1') },
    });
    await bitir(o, 3);
    expect(o.y.al(g.id)?.durum).toBe('yukleniyor');
    expect(o.adaptor.soruSor).not.toHaveBeenCalled();
    expect(bekleyenSoruSayisi(o.y.liste())).toBe(1);
    o.cevrimici.deger = true;
    await bitir(o);
    expect(o.y.al(g.id)?.durum).toBe('gonderildi');
    expect(bekleyenSoruSayisi(o.y.liste())).toBe(0);
  });

  it('409 dosya_hazir_degil: kisa aralikla yeniden dener ve basarir', async () => {
    let n = 0;
    const o = kur({
      soruSor: jest.fn(() => {
        n += 1;
        return n < 3
          ? Promise.reject(
              new ApiHata('cakisma', 'x', { durum: 409, ayrinti: 'dosya_hazir_degil' }),
            )
          : Promise.resolve(sonuc);
      }),
    });
    const g = await o.y.baslat({
      tur: 'soru',
      baslik: 'M',
      govde: { tur: 'soru', bransKodu: 'matematik', fotograflar: ['f1'] },
      dosyalar: { f1: foto('f1') },
    });
    await bitir(o);
    expect(o.y.al(g.id)?.durum).toBe('gonderildi');
    expect(n).toBe(3);
  });

  it('dosya_hazir_degil suruyorsa is kuyrukta kalir, gonderim hataya dusmez', async () => {
    const o = kur({
      soruSor: jest.fn(() =>
        Promise.reject(new ApiHata('cakisma', 'x', { durum: 409, ayrinti: 'dosya_hazir_degil' })),
      ),
    });
    const g = await o.y.baslat({
      tur: 'soru',
      baslik: 'M',
      govde: { tur: 'soru', bransKodu: 'matematik', fotograflar: ['f1'] },
      dosyalar: { f1: foto('f1') },
    });
    await bitir(o, 4);
    expect(o.y.al(g.id)?.durum).toBe('gonderiliyor');
    expect(o.kuyruk.bekleyenler()).toHaveLength(1);
    expect(o.kuyruk.basarisizlar()).toHaveLength(0);
  });

  it('ag hatasi: is kuyrukta kalir ve AYNI istek_id ile yeniden denenir (kota ikinci kez harcanmaz)', async () => {
    let n = 0;
    const o = kur({
      soruSor: jest.fn(() => {
        n += 1;
        return n === 1 ? Promise.reject(new ApiHata('ag')) : Promise.resolve(sonuc);
      }),
    });
    const g = await o.y.baslat({
      tur: 'soru',
      baslik: 'M',
      govde: { tur: 'soru', bransKodu: 'matematik', fotograflar: ['f1'] },
      dosyalar: { f1: foto('f1') },
    });
    await bitir(o);
    expect(o.y.al(g.id)?.durum).toBe('gonderildi');
    const cagrilar = (o.adaptor.soruSor as jest.Mock).mock.calls as [{ istekId: string }][];
    expect(cagrilar).toHaveLength(2);
    expect(cagrilar[0]?.[0].istekId).toBe(cagrilar[1]?.[0].istekId);
  });

  it('kota_asildi: kalici hata, gonderim hataya duser; kuyruk basarisiz listesine girmez', async () => {
    let kotaDolu = true;
    const o = kur({
      soruSor: jest.fn(() =>
        kotaDolu
          ? Promise.reject(
              new ApiHata('cok_istek', 'doldu', {
                durum: 429,
                ayrinti: 'kota_asildi',
                detay: { kota: { gunluk_sifirlanma_at: '2026-11-13T21:00:00.000Z' } },
              }),
            )
          : Promise.resolve(sonuc),
      ),
    });
    const g = await o.y.baslat({
      tur: 'soru',
      baslik: 'M',
      govde: { tur: 'soru', bransKodu: 'matematik', fotograflar: ['f1'] },
      dosyalar: { f1: foto('f1') },
    });
    await bitir(o);
    const a = o.y.al(g.id);
    expect(a?.durum).toBe('hata');
    expect(a?.hataKodu).toBe('kota_asildi');
    expect(a?.hataSifirlanma).toBe('2026-11-13T21:00:00.000Z');
    expect(o.kuyruk.basarisizlar()).toHaveLength(0);
    expect(o.kuyruk.bekleyenler()).toHaveLength(0);
    // Hak yenilenince "Yeniden dene": ayni istek_id.
    kotaDolu = false;
    o.y.yenidenDene(g.id);
    await bitir(o);
    expect(o.y.al(g.id)?.durum).toBe('gonderildi');
    const kimlikler = (o.adaptor.soruSor as jest.Mock).mock.calls.map(
      (c) => (c as [{ istekId: string }])[0].istekId,
    );
    expect(new Set(kimlikler).size).toBe(1);
  });

  it('yukleme kalici hataya duserse gonderim hata olur; yenidenDene yeniden yukler', async () => {
    let bozuk = true;
    const medya = mockMedya({
      gecikmeMs: 0,
      isle: 0,
      kancalar: {
        izinAl: () =>
          bozuk
            ? new ApiHata('dogrulama', 'x', { durum: 415, ayrinti: 'mime_desteklenmiyor' })
            : null,
      },
    });
    const o = kur({}, { medya });
    const g = await o.y.baslat({
      tur: 'soru',
      baslik: 'M',
      govde: { tur: 'soru', bransKodu: 'matematik', fotograflar: ['f1'] },
      dosyalar: { f1: foto('f1') },
    });
    await bitir(o);
    expect(o.y.al(g.id)?.durum).toBe('hata');
    expect(o.y.al(g.id)?.hataKodu).toBe('mime_desteklenmiyor');
    bozuk = false;
    o.y.yenidenDene(g.id);
    await bitir(o);
    expect(o.y.al(g.id)?.durum).toBe('gonderildi');
  });

  it('cevap: ses, cizimli fotograf (sunucudaki kaynakla) ve derste konusalim gonderir', async () => {
    const o = kur();
    const g = await o.y.baslat({
      tur: 'cevap',
      hedefId: 'soru-9',
      baslik: 'Elif',
      govde: {
        tur: 'cevap',
        soruId: 'soru-9',
        metin: 'Şöyle çöz',
        dersteKonusalim: true,
        ekler: [
          { tur: 'cizimli_fotograf', dosya: 'cz', kaynak: 'sunucu-foto-id', cizimVerisi: { v: 1 } },
          { tur: 'ses', dosya: 'ses', sureSn: 61 },
        ],
      },
      dosyalar: {
        cz: { tur: 'soru_cizim', mimeTipi: 'image/jpeg', yerelUri: 'file:///c/cz.jpg' },
        ses: { tur: 'soru_ses', mimeTipi: 'audio/mp4', yerelUri: 'file:///c/ses.m4a' },
      },
    });
    await bitir(o);
    expect(o.y.al(g.id)?.durum).toBe('gonderildi');
    const [id, girdi] = (o.adaptor.cevapla as jest.Mock).mock.calls[0] as [
      string,
      {
        dersteKonusalim: boolean;
        ekler: { tur: string; kaynakDosyaId?: string; sureSn?: number }[];
        istekId: string;
      },
    ];
    expect(id).toBe('soru-9');
    expect(girdi.dersteKonusalim).toBe(true);
    expect(girdi.ekler[0]?.kaynakDosyaId).toBe('sunucu-foto-id');
    expect(girdi.ekler[1]).toMatchObject({ tur: 'ses', sureSn: 61 });
    expect(girdi.istekId).toBe(g.istekId);
  });

  it('takip gonderir', async () => {
    const o = kur();
    const g = await o.y.baslat({
      tur: 'takip',
      hedefId: 'soru-3',
      baslik: 'Takip',
      govde: { tur: 'takip', soruId: 'soru-3', metin: 'Hâlâ anlamadım', ekler: [] },
      dosyalar: {},
    });
    await bitir(o);
    expect(o.y.al(g.id)?.durum).toBe('gonderildi');
    expect(o.adaptor.takip).toHaveBeenCalledWith('soru-3', {
      metin: 'Hâlâ anlamadım',
      istekId: g.istekId,
    });
  });

  it('uygulama yeniden baslayinca bekleyen gonderim kayitli ve devam eder', async () => {
    const o = kur();
    o.cevrimici.deger = false;
    const g = await o.y.baslat({
      tur: 'soru',
      baslik: 'M',
      govde: { tur: 'soru', bransKodu: 'matematik', fotograflar: ['f1'] },
      dosyalar: { f1: foto('f1') },
    });
    // "Yeniden baslat": ayni depolarla yeni nesneler.
    const medya = mockMedya({ gecikmeMs: 0, isle: 0 });
    const o2 = kur({}, { depo: o.depo, kuyrukDepo: o.kuyrukDepo, yukleDepo: o.yukleDepo, medya });
    expect(o2.y.al(g.id)?.durum).toBe('yukleniyor');
    expect(o2.yukleme.liste()).toHaveLength(1);
    await bitir(o2);
    expect(o2.y.al(g.id)?.durum).toBe('gonderildi');
    expect(o2.adaptor.soruSor).toHaveBeenCalledTimes(1);
  });

  it('vazgec kaydi, bekleyen isi ve dosyalari siler; sonradan isleyici no-op', async () => {
    const o = kur();
    o.cevrimici.deger = false;
    const g = await o.y.baslat({
      tur: 'soru',
      baslik: 'M',
      govde: { tur: 'soru', bransKodu: 'matematik', fotograflar: ['f1'] },
      dosyalar: { f1: foto('f1') },
    });
    await o.y.vazgec(g.id);
    expect(o.y.liste()).toHaveLength(0);
    expect(o.yukleme.liste()).toHaveLength(0);
  });

  it('eski gonderildi kayitlari 24 saat sonra temizlenir', async () => {
    const o = kur();
    const g = await o.y.baslat({
      tur: 'takip',
      hedefId: 's',
      baslik: 'T',
      govde: { tur: 'takip', soruId: 's', metin: 'x', ekler: [] },
      dosyalar: {},
    });
    await bitir(o);
    o.y.temizle(g.olusturulduAt + 3_600_000);
    expect(o.y.liste()).toHaveLength(1);
    o.y.temizle(g.olusturulduAt + 25 * 3_600_000);
    expect(o.y.liste()).toHaveLength(0);
  });
});
