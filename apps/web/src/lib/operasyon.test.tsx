import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  dersFormunuDogrula,
  gecDakikaHatasi,
  haftalikKural,
  krediDurumu,
  tutarCoz,
  waNumarasi,
  whatsappBaglantisi,
  yoklamaSatirlari,
  type DersFormu,
  type YoklamaGirdisi,
} from './operasyon';

import { KrediRozeti } from '@/components/finans/kredi-rozeti';
import { OgrenciGorunumu } from '@/components/finans/ogrenci-karti';

describe('kalan ders rozeti esigi', () => {
  it('esik ve alti sari, 0 ve alti kirmizi, ustu normal', () => {
    expect(krediDurumu('paket', 5, 2)).toBe('normal');
    expect(krediDurumu('paket', 3, 2)).toBe('normal');
    expect(krediDurumu('paket', 2, 2)).toBe('dusuk');
    expect(krediDurumu('paket', 1, 2)).toBe('dusuk');
    expect(krediDurumu('paket', 0, 2)).toBe('bitti');
    expect(krediDurumu('paket', -1, 2)).toBe('bitti');
  });
  it('paket olmayan modelde rozet yok', () => {
    expect(krediDurumu('yok', 0, 2)).toBe('yok');
    expect(krediDurumu('ders_basi', 0, 2)).toBe('yok');
  });
  it('renk tek sinyal degil: her durumun metni vardir', () => {
    const { rerender } = render(<KrediRozeti model="paket" kalan={0} esik={2} />);
    expect(screen.getByText('Ders kalmadı')).toBeInTheDocument();
    rerender(<KrediRozeti model="paket" kalan={2} esik={2} />);
    expect(screen.getByText('2 ders kaldı, azalıyor')).toBeInTheDocument();
    rerender(<KrediRozeti model="paket" kalan={8} esik={2} />);
    expect(screen.getByText('8 ders kaldı')).toBeInTheDocument();
  });
});

describe('para girisi', () => {
  it('Turkce tutari kurusa cevirir', () => {
    expect(tutarCoz('1.500')).toEqual({ ok: true, kurus: 150_000 });
    expect(tutarCoz('1500,50')).toEqual({ ok: true, kurus: 150_050 });
    expect(tutarCoz(' 75 ')).toEqual({ ok: true, kurus: 7_500 });
  });
  it('gecersiz, bos, sifir ve ondalik noktali girisi reddeder', () => {
    for (const m of ['', 'abc', '0', '0,00', '12.5', '1,234', '-5']) {
      expect(tutarCoz(m)).toEqual({ ok: false });
    }
  });
});

describe('ders formu dogrulamasi', () => {
  const gecerli: DersFormu = {
    grupId: 'g1',
    tarih: '2026-11-10',
    saat: '16:00',
    sureDk: '60',
    brans: '',
    tekrarla: false,
    bitisTarihi: '',
    online: '',
    yer: '',
  };
  it('gecerli formda hata yok', () => {
    expect(dersFormunuDogrula(gecerli)).toEqual({});
    expect(dersFormunuDogrula({ ...gecerli, online: 'https://meet.ornek.test/x' })).toEqual({});
  });
  it('eksik ve hatali alanlari yakalar', () => {
    const h = dersFormunuDogrula({
      ...gecerli,
      grupId: '',
      saat: '25:00',
      sureDk: '5',
      tekrarla: true,
      bitisTarihi: '2026-11-01',
      online: 'ftp://x',
    });
    expect(Object.keys(h).sort()).toEqual(['bitis', 'grup', 'online', 'saat', 'sure']);
  });
  it('haftalik kural baslangic gununu kullanir', () => {
    expect(haftalikKural(0)).toBe('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO');
    expect(haftalikKural(6)).toBe('FREQ=WEEKLY;INTERVAL=1;BYDAY=SU');
  });
});

describe('yoklama govdesi', () => {
  const g = (ek: Partial<YoklamaGirdisi>): YoklamaGirdisi => ({
    durum: 'geldi',
    gecDakika: '10',
    not: '',
    ogrenciyeGorunsun: true,
    ...ek,
  });
  it('notsuz satir "bana ozel" kalir; gec dakika yalniz gec durumunda gider', () => {
    const satirlar = yoklamaSatirlari(
      {
        a: g({}),
        b: g({ durum: 'gec', gecDakika: '15', not: ' Geç kaldı ', ogrenciyeGorunsun: true }),
        c: g({ durum: 'gelmedi', not: 'Hasta', ogrenciyeGorunsun: false }),
      },
      '2026-11-09T10:00:00.000Z',
    );
    expect(satirlar[0]).toEqual({
      ogrenci_id: 'a',
      durum: 'geldi',
      not: null,
      not_gorunurluk: 'ogretmene_ozel',
      isaretlenme_at: '2026-11-09T10:00:00.000Z',
    });
    expect(satirlar[1]).toMatchObject({
      gec_dakika: 15,
      not: 'Geç kaldı',
      not_gorunurluk: 'ogrenciye',
    });
    expect(satirlar[2]).toMatchObject({ not_gorunurluk: 'ogretmene_ozel' });
    expect(satirlar[2]).not.toHaveProperty('gec_dakika');
  });
  it('gec dakikasi 1-240 olmali', () => {
    expect(gecDakikaHatasi(g({ durum: 'gec', gecDakika: '0' }))).not.toBeNull();
    expect(gecDakikaHatasi(g({ durum: 'gec', gecDakika: '241' }))).not.toBeNull();
    expect(gecDakikaHatasi(g({ durum: 'gec', gecDakika: '12' }))).toBeNull();
    expect(gecDakikaHatasi(g({ durum: 'geldi', gecDakika: 'x' }))).toBeNull();
  });
});

describe('whatsapp baglantisi', () => {
  it('telefonu normallestirir ve metni kodlar', () => {
    expect(waNumarasi('+905321110003')).toBe('905321110003');
    expect(waNumarasi('0532 111 00 03')).toBe('905321110003');
    expect(waNumarasi('123')).toBeNull();
    expect(waNumarasi(null)).toBeNull();
    expect(whatsappBaglantisi('0532 111 00 03', 'Merhaba, ₺1.500')).toBe(
      'https://wa.me/905321110003?text=Merhaba%2C%20%E2%82%BA1.500',
    );
    expect(whatsappBaglantisi(null, 'x')).toBeNull();
  });
});

describe('ogrenci gorunumu', () => {
  it('yalniz kalan dersi gosterir; fiyat ve borc metni yoktur', () => {
    const { container } = render(<OgrenciGorunumu kalan={4} />);
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/₺|borç|bakiye|ücret|fiyat/i);
  });
  it('kurum ayari kapaliysa (null) hicbir sey gostermez', () => {
    const { container } = render(<OgrenciGorunumu kalan={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
