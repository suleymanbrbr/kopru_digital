import { OLCEK_KODLARI } from '../api/degerlendirmeTipleri';
import {
  basladiDurumu,
  degerlendirmeFormuDogrula,
  donemCoz,
  donemEtiketi,
  donemGecerliMi,
  donemSecimiBul,
  guvenliBaglanti,
  oneriBasligi,
  oneriFormuDogrula,
  oneriGirdisi,
  oneridenFormParametreleri,
  puanMetni,
  yazarAdi,
  type OneriFormDegeri,
} from './kurallar';

// 2026-11-26 Persembe; haftanin Pazartesisi 2026-11-23.
const BUGUN = '2026-11-26';

describe('donem', () => {
  it('bu hafta Pazartesi..Pazar, gecen hafta, bugun, dun', () => {
    expect(donemCoz('hafta', BUGUN)).toEqual({ baslangic: '2026-11-23', bitis: '2026-11-29' });
    expect(donemCoz('gecen_hafta', BUGUN)).toEqual({
      baslangic: '2026-11-16',
      bitis: '2026-11-22',
    });
    expect(donemCoz('bugun', BUGUN)).toEqual({ baslangic: BUGUN, bitis: BUGUN });
    expect(donemCoz('dun', BUGUN)).toEqual({ baslangic: '2026-11-25', bitis: '2026-11-25' });
    // Pazar gunu de ayni hafta.
    expect(donemCoz('hafta', '2026-11-29').baslangic).toBe('2026-11-23');
  });

  it('etiket ve secim bulma (ozel donem korunur)', () => {
    expect(donemEtiketi('2026-11-23', '2026-11-29')).toBe('23 Kas – 29 Kas');
    expect(donemEtiketi('2026-11-26', '2026-11-26')).toBe('26 Kas');
    expect(donemSecimiBul({ baslangic: '2026-11-23', bitis: '2026-11-29' }, BUGUN)).toBe('hafta');
    expect(donemSecimiBul({ baslangic: '2026-11-25', bitis: '2026-11-25' }, BUGUN)).toBe('dun');
    expect(donemSecimiBul({ baslangic: '2026-11-01', bitis: '2026-11-10' }, BUGUN)).toBe('ozel');
  });

  it('gecerlilik: gelecek baslangic, ters aralik ve 31 gunu asan donem gecersiz', () => {
    expect(donemGecerliMi({ baslangic: '2026-11-23', bitis: '2026-11-29' }, BUGUN)).toBe(true);
    expect(donemGecerliMi({ baslangic: '2026-11-27', bitis: '2026-11-27' }, BUGUN)).toBe(false);
    expect(donemGecerliMi({ baslangic: '2026-11-10', bitis: '2026-11-09' }, BUGUN)).toBe(false);
    expect(donemGecerliMi({ baslangic: '2026-10-01', bitis: '2026-10-31' }, BUGUN)).toBe(true);
    expect(donemGecerliMi({ baslangic: '2026-10-01', bitis: '2026-11-01' }, BUGUN)).toBe(false);
  });
});

describe('degerlendirme formu dogrulama', () => {
  const bos = Object.fromEntries(OLCEK_KODLARI.map((k) => [k, null]));
  it('yorum ya da en az bir olcek gerekir', () => {
    expect(degerlendirmeFormuDogrula({ olcekler: bos, yorum: '  ' })).toEqual({ bos: true });
    expect(degerlendirmeFormuDogrula({ olcekler: { calisma_duzeni: 3 }, yorum: '' })).toEqual({});
    expect(degerlendirmeFormuDogrula({ olcekler: bos, yorum: 'iyi' })).toEqual({});
  });
  it('yorum 4000 karakteri asamaz', () => {
    expect(degerlendirmeFormuDogrula({ olcekler: bos, yorum: 'a'.repeat(4001) })).toEqual({
      yorumUzun: true,
    });
  });
});

describe('gosterim', () => {
  it('ortalama virgullu, veri yoksa tire', () => {
    expect(puanMetni(3.5)).toBe('3,5');
    expect(puanMetni(4)).toBe('4');
    expect(puanMetni(null)).toBe('-');
  });
  it('yazar adi: silinmis hesapta "Eski öğretmen", kendisi "(sen)"', () => {
    expect(yazarAdi({ yazarAd: 'Ayşe Kaya', benim: true })).toBe('Ayşe Kaya (sen)');
    expect(yazarAdi({ yazarAd: null, benim: false })).toBe('Eski öğretmen');
  });
  it('basladi durumu: true, false, link icin olculemez', () => {
    expect(basladiDurumu(true).anahtar).toBe('basladi');
    expect(basladiDurumu(false).anahtar).toBe('baslamadi');
    expect(basladiDurumu(null).anahtar).toBe('olculemez');
  });
  it('oneri basligi: kitap, kitap + test, baslik', () => {
    const o = { kaynakKitapAd: 'Esen', kaynakTestAd: 'Test 3', baslik: 'B' };
    expect(oneriBasligi({ ...o, tur: 'kaynak_kitap' })).toBe('Esen');
    expect(oneriBasligi({ ...o, tur: 'kaynak_kitap_testi' })).toBe('Esen · Test 3');
    expect(oneriBasligi({ ...o, tur: 'serbest' })).toBe('B');
  });
  it('yalniz http/https baglanti acilabilir', () => {
    expect(guvenliBaglanti('https://example.com/a')).toBe('https://example.com/a');
    expect(guvenliBaglanti('javascript:alert(1)')).toBeNull();
    expect(guvenliBaglanti('ftp://x.com')).toBeNull();
    expect(guvenliBaglanti('kopru://soru/1')).toBeNull();
    expect(guvenliBaglanti(null)).toBeNull();
    expect(guvenliBaglanti('not a url')).toBeNull();
  });
});

describe('oneri formu', () => {
  const taban: OneriFormDegeri = {
    tur: 'serbest',
    kitapId: null,
    testId: null,
    baglanti: '',
    baslik: '',
    bransKodu: null,
    konuId: null,
    notMetni: '',
  };
  it('her tur kendi zorunlu alanini ister', () => {
    expect(oneriFormuDogrula({ ...taban, tur: 'kaynak_kitap' })).toEqual({ kitap: true });
    expect(oneriFormuDogrula({ ...taban, tur: 'kaynak_kitap_testi' })).toEqual({ test: true });
    expect(oneriFormuDogrula({ ...taban, tur: 'link', baglanti: 'abc' })).toEqual({
      baglanti: true,
      baslik: true,
    });
    expect(oneriFormuDogrula({ ...taban })).toEqual({ baslik: true });
    expect(oneriFormuDogrula({ ...taban, baslik: 'x', konuId: 'k' })).toEqual({ ders: true });
    expect(oneriFormuDogrula({ ...taban, baslik: 'x', notMetni: 'n'.repeat(1001) })).toEqual({
      notUzun: true,
    });
  });
  it('girdi: bos alanlar yollanmaz, link normalize edilir', () => {
    expect(oneriGirdisi({ ...taban, baslik: ' Fasikul ' })).toEqual({
      tur: 'serbest',
      baslik: 'Fasikul',
    });
    expect(
      oneriGirdisi({
        ...taban,
        tur: 'link',
        baglanti: 'https://example.com',
        baslik: 'A',
        bransKodu: 'matematik',
        notMetni: 'n',
      }),
    ).toEqual({
      tur: 'link',
      baglantiUrl: 'https://example.com/',
      baslik: 'A',
      bransKodu: 'matematik',
      notMetni: 'n',
    });
    expect(oneriGirdisi({ ...taban, tur: 'kaynak_kitap' })).toBeNull();
  });
});

describe('oneriden gunluk kayit formu on doldurma', () => {
  const kitap = {
    kaynakKitapId: 'kitap-1',
    kaynakKitapAd: 'Esen',
    kaynakTestId: null,
    kaynakTestAd: null,
    baslik: null,
    bransKodu: 'matematik',
    konuId: 'konu-1',
  };
  it('kitap: kitap + ders + konu; test: test de eklenir', () => {
    expect(oneridenFormParametreleri({ ...kitap, tur: 'kaynak_kitap' })).toEqual({
      kaynakKitapId: 'kitap-1',
      kaynakKitapAd: 'Esen',
      bransKodu: 'matematik',
      konuId: 'konu-1',
    });
    expect(
      oneridenFormParametreleri({
        ...kitap,
        tur: 'kaynak_kitap_testi',
        kaynakTestId: 'test-1',
        kaynakTestAd: 'Test 1',
      }),
    ).toMatchObject({ kaynakKitapId: 'kitap-1', kaynakTestId: 'test-1', kaynakTestAd: 'Test 1' });
  });
  it('serbest: metin; link: null (kayitta kaynak olamaz)', () => {
    expect(
      oneridenFormParametreleri({
        ...kitap,
        kaynakKitapId: null,
        tur: 'serbest',
        baslik: 'Okul fasikülü',
        bransKodu: null,
        konuId: null,
      }),
    ).toEqual({ kaynakMetin: 'Okul fasikülü' });
    expect(oneridenFormParametreleri({ ...kitap, tur: 'link', baslik: 'x' })).toBeNull();
  });
});
