import { describe, expect, it } from 'vitest';

import { derinBaglantiyiCoz } from './derin-baglanti';

import type { Rol } from '@/lib/navigasyon';

const K = 'kurum-x';
const coz = (b: string | null | undefined, rol: Rol) => derinBaglantiyiCoz(b, { kurumId: K, rol });
const BILDIRIMLER = `/${K}/bildirimler`;

describe('derinBaglantiyiCoz', () => {
  it('soru: ogrenci soru-sor, personel sorular', () => {
    expect(coz('kopru://soru/abc-123', 'ogrenci')).toBe(`/${K}/soru-sor/abc-123`);
    expect(coz('kopru://soru/abc-123', 'ogretmen')).toBe(`/${K}/sorular/abc-123`);
    expect(coz('kopru://soru/abc-123', 'sahip')).toBe(`/${K}/sorular/abc-123`);
    expect(coz('kopru://soru', 'ogrenci')).toBe(`/${K}/soru-sor`);
    expect(coz('kopru://sorular', 'yonetici')).toBe(`/${K}/sorular`);
  });

  it('bugun ve takvim tabanli hedefler her rolde calisir', () => {
    expect(coz('kopru://bugun', 'ogrenci')).toBe(`/${K}/bugun`);
    expect(coz('kopru://bugun', 'ogretmen')).toBe(`/${K}/bugun`);
    expect(coz('kopru://ders/d1', 'ogrenci')).toBe(`/${K}/takvim`);
    expect(coz('kopru://ders/d1', 'ogretmen')).toBe(`/${K}/takvim`);
    expect(coz('kopru://dersler', 'sahip')).toBe(`/${K}/takvim`);
  });

  it('odev: ogrenci odevlerim, personel odevler', () => {
    expect(coz('kopru://odev/o1', 'ogrenci')).toBe(`/${K}/odevlerim`);
    expect(coz('kopru://odev/o1', 'ogretmen')).toBe(`/${K}/odevler`);
  });

  it('yoklama: personel yoklama, ogrenci takvim', () => {
    expect(coz('kopru://yoklama/d1', 'ogretmen')).toBe(`/${K}/yoklama`);
    expect(coz('kopru://yoklama/d1', 'ogrenci')).toBe(`/${K}/takvim`);
  });

  it('kayit: ogrenci kayitlarim, personel kayitlar', () => {
    expect(coz('kopru://kayit/k1', 'ogrenci')).toBe(`/${K}/kayitlarim`);
    expect(coz('kopru://kayit/k1', 'ogretmen')).toBe(`/${K}/kayitlar`);
  });

  it('oyunlastirma ve odak yalniz ogrencide acilir', () => {
    for (const b of ['karakter', 'seri', 'rozet', 'seviye', 'oyunlastirma']) {
      expect(coz(`kopru://${b}`, 'ogrenci')).toBe(`/${K}/karakterim`);
      expect(coz(`kopru://${b}`, 'ogretmen')).toBe(BILDIRIMLER);
    }
    expect(coz('kopru://odak', 'ogrenci')).toBe(`/${K}/odak`);
    expect(coz('kopru://odak', 'sahip')).toBe(BILDIRIMLER);
  });

  it('finans, ogrenci, grup yalniz personelde', () => {
    expect(coz('kopru://finans', 'yonetici')).toBe(`/${K}/finans`);
    expect(coz('kopru://finans/ogrenci/u1', 'ogretmen')).toBe(`/${K}/finans`);
    expect(coz('kopru://finans', 'ogrenci')).toBe(BILDIRIMLER);
    expect(coz('kopru://ogrenci/u1', 'ogretmen')).toBe(`/${K}/ogrenciler/u1`);
    expect(coz('kopru://ogrenci/u1', 'ogrenci')).toBe(BILDIRIMLER);
    expect(coz('kopru://grup/g1', 'sahip')).toBe(`/${K}/gruplar/g1`);
  });

  it('geri bildirim, abonelik, davet, oturumlar', () => {
    expect(coz('kopru://geri-bildirim', 'yonetici')).toBe(`/${K}/geri-bildirim`);
    expect(coz('kopru://geri-bildirim', 'ogrenci')).toBe(`/${K}/bugun`);
    expect(coz('kopru://geri-bildirim', 'ogretmen')).toBe(BILDIRIMLER);
    expect(coz('kopru://abonelik', 'sahip')).toBe(`/${K}/abonelik`);
    expect(coz('kopru://abonelik', 'yonetici')).toBe(BILDIRIMLER);
    expect(coz('kopru://davet/tok_en-1', 'ogrenci')).toBe('/davet/tok_en-1');
    expect(coz('kopru://oturumlar', 'ogretmen')).toBe(`/${K}/oturumlar`);
  });

  it('degerlendirme ve kaynak onerisi: ogrenci "Ogretmenim" sekmesi, personel bildirimler', () => {
    const SEKME = `/${K}/gunluk-soru?sekme=ogretmenim`;
    for (const b of [
      'kopru://degerlendirmelerim',
      'kopru://kaynak-onerilerim',
      'kopru://degerlendirme/d1',
      'kopru://kaynak-onerisi/k1',
    ]) {
      expect(coz(b, 'ogrenci'), b).toBe(SEKME);
      expect(coz(b, 'ogretmen'), b).toBe(BILDIRIMLER);
    }
    expect(coz('kopru://kocluk/o1', 'ogretmen')).toBe(`/${K}/ogrenciler/o1?sekme=kocluk`);
    expect(coz('kopru://kocluk/o1', 'ogrenci')).toBe(BILDIRIMLER);
    expect(coz('kopru://kocluk', 'ogretmen')).toBe(BILDIRIMLER);
  });

  it('duyuru: tum roller duyurular sayfasina (kimlikliyse ayrintiya) gider', () => {
    expect(coz('kopru://duyuru/x', 'ogrenci')).toBe(`/${K}/duyurular/x`);
    expect(coz('kopru://duyuru/x', 'ogretmen')).toBe(`/${K}/duyurular/x`);
    expect(coz('kopru://duyuru/x', 'sahip')).toBe(`/${K}/duyurular/x`);
    expect(coz('kopru://duyurular', 'ogretmen')).toBe(`/${K}/duyurular`);
    expect(coz('kopru://duyuru', 'ogrenci')).toBe(`/${K}/duyurular`);
    expect(coz('kopru://duyuru/../x', 'ogrenci')).toBe(BILDIRIMLER);
    expect(coz('kopru://duyuru/a b', 'ogrenci')).toBe(BILDIRIMLER);
  });

  it('bilinmeyen baglantilar bildirimler sayfasinda kalir', () => {
    expect(coz('kopru://bilinmeyen/yol', 'ogrenci')).toBe(BILDIRIMLER);
    expect(coz('kopru://', 'ogrenci')).toBe(BILDIRIMLER);
  });

  it('bos, bos olmayan ama kopru olmayan ve bozuk baglantilar guvenli', () => {
    expect(coz(null, 'ogrenci')).toBe(BILDIRIMLER);
    expect(coz(undefined, 'ogrenci')).toBe(BILDIRIMLER);
    expect(coz('', 'ogrenci')).toBe(BILDIRIMLER);
    expect(coz('https://kotu.example/soru/1', 'ogrenci')).toBe(BILDIRIMLER);
    expect(coz('//kotu.example', 'ogrenci')).toBe(BILDIRIMLER);
    expect(coz('kopru://soru/../../x', 'ogrenci')).toBe(BILDIRIMLER);
    expect(coz('kopru://soru/a%2Fb', 'ogrenci')).toBe(BILDIRIMLER);
    expect(coz('kopru://soru/a b', 'ogrenci')).toBe(BILDIRIMLER);
  });

  it('sorgu ve parca yok sayilir; buyuk/kucuk harf duyarsiz hedef', () => {
    expect(coz('kopru://soru/abc?x=1#y', 'ogrenci')).toBe(`/${K}/soru-sor/abc`);
    expect(coz('KOPRU://Soru/abc', 'ogrenci')).toBe(`/${K}/soru-sor/abc`);
  });

  it('veli icin hicbir kurum ekrani acilmaz', () => {
    expect(coz('kopru://soru/a', 'veli')).toBe(BILDIRIMLER);
    expect(coz('kopru://odev/a', 'veli')).toBe(BILDIRIMLER);
  });
});
