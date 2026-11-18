import type { ModulDurumu } from '@kopru/contracts';

import {
  KUTU_ROTASI,
  baglantiRotasi,
  derinBaglantiyiAyristir,
  yukuAyristir,
  type BaglantiBaglami,
} from './baglanti';

const ID = '0190f3a0-0000-7000-8000-0000000000a1';
const HEPSI: ModulDurumu = {
  takvim: true,
  yoklama: true,
  kayitlar: true,
  odev: true,
  soru_sor: true,
  oyunlastirma: true,
  duyuru: true,
};
const ogrenci = (moduller: ModulDurumu = HEPSI): BaglantiBaglami => ({ rol: 'ogrenci', moduller });
const hoca = (moduller: ModulDurumu = HEPSI): BaglantiBaglami => ({ rol: 'ogretmen', moduller });

describe('derinBaglantiyiAyristir', () => {
  it('tur ve kimligi ayirir', () => {
    expect(derinBaglantiyiAyristir(`kopru://soru/${ID}`)).toEqual({ tur: 'soru', id: ID });
    expect(derinBaglantiyiAyristir('kopru://bugun')).toEqual({ tur: 'bugun', id: null });
    expect(derinBaglantiyiAyristir(`KOPRU://Odev/${ID}?x=1#y`)).toEqual({ tur: 'odev', id: ID });
  });

  it('bicimsiz, bos ve tehlikeli kimlikleri reddeder', () => {
    expect(derinBaglantiyiAyristir(null)).toBeNull();
    expect(derinBaglantiyiAyristir('')).toBeNull();
    expect(derinBaglantiyiAyristir('soru/1')).toBeNull();
    expect(derinBaglantiyiAyristir('kopru://soru/../../etc')).toBeNull();
    expect(derinBaglantiyiAyristir('kopru://soru/a b')).toBeNull();
    expect(derinBaglantiyiAyristir(`kopru://soru/${'a'.repeat(101)}`)).toBeNull();
  });
});

describe('baglantiRotasi', () => {
  it('soru: kimlikle detay, kimliksiz ya da modul kapaliysa kutu', () => {
    expect(baglantiRotasi(`kopru://soru/${ID}`, ogrenci())).toEqual({
      pathname: '/(uygulama)/soru/[id]',
      params: { id: ID },
    });
    expect(baglantiRotasi(`kopru://soru/${ID}`, hoca())).toEqual({
      pathname: '/(uygulama)/soru/[id]',
      params: { id: ID },
    });
    expect(baglantiRotasi('kopru://soru', ogrenci())).toBe(KUTU_ROTASI);
    expect(baglantiRotasi(`kopru://soru/${ID}`, ogrenci({ ...HEPSI, soru_sor: false }))).toBe(
      KUTU_ROTASI,
    );
  });

  it('odev: ogrenci teslim, personel ozet', () => {
    expect(baglantiRotasi(`kopru://odev/${ID}`, ogrenci())).toEqual({
      pathname: '/odev-teslim/[id]',
      params: { id: ID },
    });
    expect(baglantiRotasi(`kopru://odev/${ID}`, hoca())).toEqual({
      pathname: '/odev/[id]',
      params: { id: ID },
    });
    expect(baglantiRotasi(`kopru://odev/${ID}`, hoca({}))).toBe(KUTU_ROTASI);
  });

  it('ders: personel Dersler sekmesi, ogrenci Bugun; yoklama kimlikle ekran', () => {
    expect(baglantiRotasi(`kopru://ders/${ID}`, hoca())).toEqual({
      pathname: '/dersler',
      navigate: true,
    });
    expect(baglantiRotasi(`kopru://ders/${ID}`, ogrenci())).toEqual({
      pathname: '/bugun',
      navigate: true,
    });
    expect(baglantiRotasi(`kopru://yoklama/${ID}`, hoca())).toEqual({
      pathname: '/yoklama/[dersId]',
      params: { dersId: ID },
    });
  });

  it('kayit: yalniz kayitlar modulu acik ogrenciye Kayitlarim', () => {
    expect(baglantiRotasi('kopru://kayitlarim', ogrenci())).toEqual({ pathname: '/kayitlarim' });
    expect(baglantiRotasi(`kopru://kayit/${ID}`, ogrenci())).toEqual({ pathname: '/kayitlarim' });
    expect(baglantiRotasi('kopru://kayitlarim', ogrenci({ ...HEPSI, kayitlar: false }))).toBe(
      KUTU_ROTASI,
    );
    expect(baglantiRotasi('kopru://kayitlarim', hoca())).toBe(KUTU_ROTASI);
  });

  it('karakter / motivasyon: oyunlastirma acik ogrenciye Karakterim, aksi halde Bugun', () => {
    expect(baglantiRotasi('kopru://karakter', ogrenci())).toEqual({
      pathname: '/karakterim',
      navigate: true,
    });
    expect(
      baglantiRotasi('kopru://motivasyon', ogrenci({ ...HEPSI, oyunlastirma: false })),
    ).toEqual({ pathname: '/bugun', navigate: true });
    expect(baglantiRotasi('kopru://karakter', hoca())).toEqual({
      pathname: '/bugun',
      navigate: true,
    });
  });

  it('duyuru: modul aciksa detay (her rol), kapaliysa ya da kimliksizse kutu', () => {
    const detay = { pathname: '/duyuru/[id]', params: { id: ID } };
    expect(baglantiRotasi(`kopru://duyuru/${ID}`, ogrenci())).toEqual(detay);
    expect(baglantiRotasi(`kopru://duyuru/${ID}`, hoca())).toEqual(detay);
    expect(baglantiRotasi(`kopru://duyuru/${ID}`, ogrenci({ ...HEPSI, duyuru: false }))).toBe(
      KUTU_ROTASI,
    );
    expect(baglantiRotasi('kopru://duyuru', ogrenci())).toBe(KUTU_ROTASI);
    expect(baglantiRotasi('kopru://duyuru/../x', ogrenci())).toBe(KUTU_ROTASI);
  });

  it('bugun, bilinmeyen ve bos baglanti', () => {
    expect(baglantiRotasi('kopru://bugun', ogrenci())).toEqual({
      pathname: '/bugun',
      navigate: true,
    });
    expect(baglantiRotasi('kopru://yepyeni/ozellik', ogrenci())).toBe(KUTU_ROTASI);
    expect(baglantiRotasi('https://ornek.com/x', ogrenci())).toBe(KUTU_ROTASI);
    expect(baglantiRotasi(null, ogrenci())).toBe(KUTU_ROTASI);
  });
});

describe('yukuAyristir', () => {
  it('sunucu verisini okur', () => {
    expect(
      yukuAyristir(
        { derin_baglanti: `kopru://soru/${ID}`, bildirim_id: ID },
        { baslik: 'B', govde: 'G' },
      ),
    ).toEqual({
      derinBaglanti: `kopru://soru/${ID}`,
      bildirimId: ID,
      kurumId: null,
      baslik: 'B',
      govde: 'G',
    });
  });

  it('ic ice (body) ve kurum kimligini tanir', () => {
    const y = yukuAyristir({ body: { derin_baglanti: 'kopru://bugun', kurum_id: ID } });
    expect(y.derinBaglanti).toBe('kopru://bugun');
    expect(y.kurumId).toBe(ID);
    expect(y.bildirimId).toBeNull();
  });

  it('beklenmeyen veri cokmeden bos alan olur', () => {
    for (const girdi of [undefined, null, 'x', 5, [], { derin_baglanti: 5, bildirim_id: '../x' }]) {
      const y = yukuAyristir(girdi);
      expect(y.derinBaglanti).toBeNull();
      expect(y.bildirimId).toBeNull();
    }
  });
});
