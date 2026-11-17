import { describe, expect, it, afterAll, beforeAll } from 'vitest';

import {
  SABLON_TANIMLARI,
  SablonHatasi,
  SablonKaydi,
  doldur,
  sablonDogrula,
  sablonlar,
  sablonlariYukle,
  sablonuCoz,
  yerTutucular,
} from './sablonlar.js';
import { ortamKur, type Ortam } from './test/ortam.js';
import { dbYok } from './test/yardimcilar.js';

describe('sablon doldurma', () => {
  it('yer tutuculari yalniz verilen degiskenlerle doldurur, fazlasini yok sayar', () => {
    expect(doldur('{{a}} ve {{ b }}', { a: 1, b: 'x', c: 'kullanilmaz' })).toBe('1 ve x');
  });

  it('eksik degisken SablonHatasi (kalici hata)', () => {
    expect(() => doldur('merhaba {{ad}}', {})).toThrow(SablonHatasi);
    expect(() => doldur('merhaba {{ad}}', {})).toThrow(/"ad" değişkeni verilmedi/);
  });

  it('yer tutucu adlari tekilleserek listelenir', () => {
    expect(yerTutucular('{{a}} {{b}} {{a}}')).toEqual(['a', 'b']);
    expect(yerTutucular(undefined)).toEqual([]);
  });

  it('degisken degeri tekrar yorumlanmaz (enjeksiyon yok)', () => {
    expect(doldur('{{a}}', { a: '{{b}}', b: 'x' })).toBe('{{b}}');
  });
});

describe('sablon dogrulama', () => {
  it('kisisel veri iceren sablon push ve sms kanalinda reddedilir, kutu ve epostada kabul edilir', () => {
    const t = { kod: 'x', kategori: 'soru', govde: 'g', kisiselVeri: true } as const;
    expect(() => {
      sablonDogrula({ ...t, kanal: 'push' });
    }).toThrow(/push\/sms kanalında/);
    expect(() => {
      sablonDogrula({ ...t, kanal: 'sms' });
    }).toThrow(SablonHatasi);
    expect(() => {
      sablonDogrula({ ...t, kanal: 'kutu' });
    }).not.toThrow();
    expect(() => {
      sablonDogrula({ ...t, kanal: 'eposta' });
    }).not.toThrow();
  });

  it('push metninde kisisel/hassas degisken adlari (ad, telefon, not, ucret...) yasak', () => {
    for (const ad of [
      'ogrenci_adi',
      'telefon',
      'eposta',
      'not',
      'ucret',
      'tutar_kurus',
      'bakiye',
      'mesaj',
    ]) {
      expect(() => {
        sablonDogrula({ kod: 'x', kategori: 'odev', kanal: 'push', govde: `deger {{${ad}}}` });
      }, ad).toThrow(/değişkeni kullanılamaz/);
    }
    // kimlik ve sayac degiskenleri serbest; kutuda yasak yok
    expect(() => {
      sablonDogrula({
        kod: 'x',
        kategori: 'odev',
        kanal: 'push',
        govde: '{{mevcut_seri}} gün',
        derinBaglanti: 'kopru://odev/{{odev_id}}',
      });
    }).not.toThrow();
    expect(() => {
      sablonDogrula({
        kod: 'x',
        kategori: 'odev',
        kanal: 'kutu',
        govde: '{{ogrenci_adi}} teslim etti',
      });
    }).not.toThrow();
  });

  it('gecersiz kod/kategori ve yinelenen sablon reddedilir', () => {
    expect(() => {
      sablonDogrula({ kod: 'X Y', kategori: 'soru', kanal: 'kutu', govde: 'g' });
    }).toThrow();
    expect(() => {
      sablonDogrula({ kod: 'x', kategori: 'yok' as never, kanal: 'kutu', govde: 'g' });
    }).toThrow();
    const t = { kod: 'x', kategori: 'soru', kanal: 'kutu', govde: 'g' } as const;
    expect(() => new SablonKaydi([t, t])).toThrow(/yinelenen/);
  });

  it('kayitli tum sablonlar gecerli; her push sablonunun kutu es i var, kategorileri ayni', () => {
    for (const t of SABLON_TANIMLARI) {
      expect(() => {
        sablonDogrula(t);
      }).not.toThrow();
      if (t.kanal === 'push') {
        const kutu = sablonlar.bul(t.kod, 'kutu');
        expect(kutu, t.kod).toBeDefined();
        expect(kutu?.kategori).toBe(t.kategori);
        expect(t.kisiselVeri ?? false).toBe(false);
      }
    }
  });

  it('iki ornek sablon dogru metin ve derin baglanti uretir', () => {
    const soru = sablonlar.bul('soru_cevaplandi', 'push');
    expect(soru && sablonuCoz(soru, { soru_id: 'abc' })).toEqual({
      baslik: 'Sorun cevaplandı',
      govde: 'Sorduğun soruya cevap geldi.',
      derinBaglanti: 'kopru://soru/abc',
    });
  });
});

describe.skipIf(dbYok())('sablonlar tablosu (kodlu tohum aynasi)', () => {
  let o: Ortam;
  beforeAll(() => {
    o = ortamKur();
  });
  afterAll(async () => {
    await o.kapat();
  });

  it('sablonlariYukle tabloyu kodla esler; ikinci calistirma bir sey degistirmez', async () => {
    const ilk = await o.app.orm.transaction((tx) => sablonlariYukle(tx));
    expect(ilk).toBe(SABLON_TANIMLARI.length);
    const ikinci = await o.app.orm.transaction((tx) => sablonlariYukle(tx));
    expect(ikinci).toBe(0);
    const satirlar = await o.sistem<{ kod: string; kanal: string; surum: string }[]>`
      select kod, kanal, surum from bildirim.sablonlar order by kod, kanal`;
    expect(satirlar).toHaveLength(SABLON_TANIMLARI.length);
    expect(satirlar.every((s) => s.surum === '1')).toBe(true);
  });

  it('icerik degisince satir guncellenir ve surum artar', async () => {
    const degisik = new SablonKaydi(
      SABLON_TANIMLARI.map((t) =>
        t.kod === 'seri_hatirlatma' && t.kanal === 'push' ? { ...t, govde: 'Yeni gövde' } : t,
      ),
    );
    expect(await o.app.orm.transaction((tx) => sablonlariYukle(tx, degisik))).toBe(1);
    const [s] = await o.sistem<{ govde: string; surum: string }[]>`
      select govde, surum from bildirim.sablonlar where kod = 'seri_hatirlatma' and kanal = 'push'`;
    expect(s).toEqual({ govde: 'Yeni gövde', surum: '2' });
    // eski haline don (diger testler icin)
    await o.app.orm.transaction((tx) => sablonlariYukle(tx));
  });
});
