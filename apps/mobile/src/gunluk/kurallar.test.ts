import type { Hucre, KonuAnalizi } from '../api/gunlukSoruTipleri';
import { bantTespitEt } from '../api/mockGunlukSoru';
import { bellekKv } from '../depo/kv';
import {
  KAYNAK_YOK,
  SON_SECIM_BOS,
  bantMetni,
  basariSinifi,
  formDogrula,
  hucreMetni,
  konulariSirala,
  sayiAyikla,
  sayiDegistir,
  sonSecimOku,
  sonSecimYaz,
  yuzdeMetni,
} from './kurallar';

const hucre = (cozulen: number, dogru: number): Hucre => ({
  cozulen,
  dogru,
  yanlis: cozulen - dogru,
  bos: 0,
  basari: cozulen === 0 ? null : dogru / cozulen,
});
const bos = hucre(0, 0);

describe('form kurallari', () => {
  it('zorunlu alanlar ve toplam siniri', () => {
    expect(
      formDogrula({ bransKodu: null, konuId: null, zorluk: null, dogru: 0, yanlis: 0, bos: 0 }),
    ).toEqual({ ders: true, konu: true, zorluk: true, toplam: 'bos' });
    expect(
      formDogrula({
        bransKodu: 'matematik',
        konuId: 'k',
        zorluk: 'orta',
        dogru: 1,
        yanlis: 0,
        bos: 0,
      }),
    ).toEqual({});
    expect(
      formDogrula({
        bransKodu: 'matematik',
        konuId: 'k',
        zorluk: 'orta',
        dogru: 500,
        yanlis: 1,
        bos: 0,
      }),
    ).toEqual({ toplam: 'cok' });
  });

  it('sayi girisi: rakam disini atar, 500 ile kisitlar; +/- 0..500', () => {
    expect(sayiAyikla('')).toBe(0);
    expect(sayiAyikla('a1b2')).toBe(12);
    expect(sayiAyikla('999')).toBe(500);
    expect(sayiDegistir(0, -1)).toBe(0);
    expect(sayiDegistir(500, 1)).toBe(500);
    expect(sayiDegistir(7, 1)).toBe(8);
  });

  it('son secim cihazda hatirlanir; bozuk kayit bos sayilir; uyelik kapsamlidir', () => {
    const depo = bellekKv();
    expect(sonSecimOku(depo, 'u1')).toEqual(SON_SECIM_BOS);
    sonSecimYaz(depo, 'u1', {
      bransKodu: 'matematik',
      konuId: 'k1',
      zorluk: 'orta',
      kaynak: { tur: 'test', kitapId: 'b', kitapAd: 'Kitap', testId: 't', testAd: 'Test 1' },
    });
    expect(sonSecimOku(depo, 'u1')).toMatchObject({ konuId: 'k1', zorluk: 'orta' });
    expect(sonSecimOku(depo, 'u2')).toEqual(SON_SECIM_BOS);
    depo.set('kopru.gunluk-son-secim.u3', '{bozuk');
    expect(sonSecimOku(depo, 'u3')).toEqual(SON_SECIM_BOS);
    depo.set(
      'kopru.gunluk-son-secim.u4',
      JSON.stringify({ bransKodu: 'fizik', zorluk: 'imkansiz', kaynak: { tur: 'x' } }),
    );
    expect(sonSecimOku(depo, 'u4')).toEqual({
      ...SON_SECIM_BOS,
      bransKodu: 'fizik',
      kaynak: KAYNAK_YOK,
    });
  });
});

describe('analiz gorunumu', () => {
  it('basari sinifi ve metinler (renk + sayi + metin)', () => {
    expect(basariSinifi(0.9)).toBe('iyi');
    expect(basariSinifi(0.8)).toBe('iyi');
    expect(basariSinifi(0.6)).toBe('orta');
    expect(basariSinifi(0.25)).toBe('zayif');
    expect(basariSinifi(null)).toBe('yok');
    expect(yuzdeMetni(0.6)).toBe('%60');
    expect(yuzdeMetni(null)).toBe('-');
    expect(hucreMetni(hucre(20, 18))).toBe('%90 · 20 soru');
    expect(hucreMetni(bos)).toBe('Kayıt yok');
  });

  it('bant tespiti: kolay %90 / orta %60 / zor %25 -> orta seviyede zorlaniyor', () => {
    const t = bantTespitEt({ kolay: hucre(20, 18), orta: hucre(20, 12), zor: hucre(20, 5) });
    expect(t).toEqual({
      durum: 'zorlaniyor',
      bant: 'orta',
      bantBasarilari: { kolay: 0.9, orta: 0.6, zor: 0.25 },
    });
    expect(bantMetni(t)).toBe('Orta seviyede zorlanıyor');
  });

  it('yeterli veri yoksa tespit yapilmaz ("veri az"); dusus yoksa sorun yok', () => {
    const az = bantTespitEt({ kolay: hucre(9, 9), orta: hucre(9, 2), zor: hucre(9, 0) });
    expect(az.durum).toBe('veri_az');
    expect(bantMetni(az)).toBe('Veri az');
    const iyi = bantTespitEt({ kolay: hucre(20, 19), orta: hucre(20, 17), zor: hucre(20, 15) });
    expect(iyi.durum).toBe('tespit_yok');
    expect(bantMetni(iyi)).toBe('Belirgin sorun yok');
  });

  it('konular once zorlananlar, sonra dusuk basariya gore siralanir', () => {
    const konu = (id: string, durum: KonuAnalizi['bant']['durum'], c: number, d: number) =>
      ({
        konuId: id,
        konuAd: id,
        ustKonuAd: null,
        hucreler: { kolay: bos, orta: bos, zor: bos, belirtilmemis: bos },
        toplam: hucre(c, d),
        bant: {
          durum,
          bant: durum === 'zorlaniyor' ? 'orta' : null,
          bantBasarilari: { kolay: null, orta: null, zor: null },
        },
      }) satisfies KonuAnalizi;
    const sirali = konulariSirala([
      konu('az', 'veri_az', 5, 5),
      konu('iyi', 'tespit_yok', 40, 38),
      konu('zor', 'zorlaniyor', 40, 20),
      konu('orta', 'tespit_yok', 40, 30),
    ]);
    expect(sirali.map((k) => k.konuId)).toEqual(['zor', 'orta', 'iyi', 'az']);
  });
});
