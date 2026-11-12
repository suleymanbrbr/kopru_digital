import type { MedyaDosyaDurumYaniti, MedyaYuklemeYaniti } from '@kopru/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  YUKLEME_BASLANGIC,
  YuklemeHatasi,
  dosyaHazirDegilDene,
  dosyaYukle,
  yenidenDenenebilir,
  yuklemeHataKodu,
  yuklemeIlerlet,
  type YuklemeBagimliliklari,
  type YuklemeDurumu,
  type YuklemeOlayi,
} from './yukleme';

import { UygulamaHatasi } from '@/lib/api';

const ID = '0190a000-0000-7000-8000-0000000000aa';

function durumYaniti(durum: MedyaDosyaDurumYaniti['durum']): MedyaDosyaDurumYaniti {
  return {
    id: ID,
    tur: 'soru_fotografi',
    durum,
    mime_tipi: 'image/jpeg',
    boyut_bayt: 10,
    genislik: null,
    yukseklik: null,
    sure_sn: null,
    hata_kodu: null,
    adresler: null,
  };
}

function izin(durum: MedyaYuklemeYaniti['dosya']['durum'], adresli = true): MedyaYuklemeYaniti {
  return {
    dosya: { id: ID, tur: 'soru_fotografi', mime_tipi: 'image/jpeg', boyut_bayt: 10, durum },
    yukleme: adresli
      ? {
          yontem: 'PUT',
          url: 'http://s3.test/x',
          basliklar: { 'content-type': 'image/jpeg' },
          gecerlilik_bitis_at: '2026-11-12T10:00:00+00:00',
        }
      : null,
  };
}

function bagimlilik(ek: Partial<YuklemeBagimliliklari> = {}): YuklemeBagimliliklari {
  return {
    ozet: () => Promise.resolve('a'.repeat(64)),
    izinIste: () => Promise.resolve(izin('yukleme_bekliyor')),
    put: (_a, _b, ilerleme) => {
      ilerleme(0.5);
      return Promise.resolve();
    },
    tamam: () => Promise.resolve(durumYaniti('isleniyor')),
    durum: () => Promise.resolve(durumYaniti('hazir')),
    bekle: () => Promise.resolve(),
    ...ek,
  };
}

const blob = new Blob(['0123456789'], { type: 'image/jpeg' });
const secenek = {
  tur: 'soru_fotografi' as const,
  blob,
  mime: 'image/jpeg',
  istemciAnahtari: '0190a000-0000-7000-8000-0000000000bb',
};

const hepsi = (olaylar: YuklemeOlayi[]): YuklemeDurumu =>
  olaylar.reduce(yuklemeIlerlet, YUKLEME_BASLANGIC);

describe('yukleme durum makinesi', () => {
  it('normal akis: hazirlaniyor -> yukleniyor -> isleniyor -> hazir', () => {
    const d = hepsi([
      { tur: 'basla' },
      { tur: 'kayit', dosyaId: ID },
      { tur: 'ilerleme', oran: 0.4 },
    ]);
    expect(d).toMatchObject({ asama: 'yukleniyor', ilerleme: 0.4, dosyaId: ID, deneme: 1 });
    const son = [{ tur: 'yuklendi' }, { tur: 'hazir' }].reduce(
      (x, o) => yuklemeIlerlet(x, o as YuklemeOlayi),
      d,
    );
    expect(son).toMatchObject({ asama: 'hazir', ilerleme: 1 });
  });

  it('ilerleme 0..1 araligina sikisir ve yalniz yukleniyor asamasinda gecer', () => {
    expect(yuklemeIlerlet(YUKLEME_BASLANGIC, { tur: 'ilerleme', oran: 0.5 })).toBe(
      YUKLEME_BASLANGIC,
    );
    const d = hepsi([{ tur: 'basla' }, { tur: 'kayit', dosyaId: ID }]);
    expect(yuklemeIlerlet(d, { tur: 'ilerleme', oran: 7 }).ilerleme).toBe(1);
    expect(yuklemeIlerlet(d, { tur: 'ilerleme', oran: -1 }).ilerleme).toBe(0);
  });

  it('hata sonrasi yeniden dene bastan baslar, deneme sayisi artar, dosya kimligi korunur', () => {
    const hatali = hepsi([
      { tur: 'basla' },
      { tur: 'kayit', dosyaId: ID },
      { tur: 'hata', kod: 'ag' },
    ]);
    expect(hatali).toMatchObject({ asama: 'hata', hata: 'ag' });
    const tekrar = yuklemeIlerlet(hatali, { tur: 'basla' });
    expect(tekrar).toMatchObject({ asama: 'hazirlaniyor', hata: null, deneme: 2, dosyaId: ID });
  });

  it('gecersiz gecisleri yok sayar (hazir/bekliyor iken hata, calisirken basla)', () => {
    const hazir = hepsi([
      { tur: 'basla' },
      { tur: 'kayit', dosyaId: ID },
      { tur: 'yuklendi' },
      { tur: 'hazir' },
    ]);
    expect(yuklemeIlerlet(hazir, { tur: 'hata', kod: 'x' })).toBe(hazir);
    expect(yuklemeIlerlet(YUKLEME_BASLANGIC, { tur: 'hata', kod: 'x' })).toBe(YUKLEME_BASLANGIC);
    const calisan = yuklemeIlerlet(YUKLEME_BASLANGIC, { tur: 'basla' });
    expect(yuklemeIlerlet(calisan, { tur: 'basla' })).toBe(calisan);
    expect(yuklemeIlerlet(hazir, { tur: 'sifirla' })).toBe(YUKLEME_BASLANGIC);
  });
});

describe('dosyaYukle', () => {
  it('izin -> PUT -> tamam -> yoklama sirasiyla calisir ve hazir olunca doner', async () => {
    const sira: string[] = [];
    const olaylar: YuklemeOlayi[] = [];
    const yoklama = [durumYaniti('isleniyor'), durumYaniti('hazir')];
    const bag = bagimlilik({
      izinIste: (g) => {
        sira.push(`izin:${g.mime_tipi}:${String(g.boyut_bayt)}`);
        return Promise.resolve(izin('yukleme_bekliyor'));
      },
      put: (a, _b, ilerleme) => {
        sira.push(`put:${a.url}:${a.basliklar['content-type'] ?? ''}`);
        ilerleme(1);
        return Promise.resolve();
      },
      tamam: () => {
        sira.push('tamam');
        return Promise.resolve(durumYaniti('isleniyor'));
      },
      durum: () => {
        sira.push('durum');
        return Promise.resolve(yoklama.shift() ?? durumYaniti('hazir'));
      },
    });
    const sonuc = await dosyaYukle(secenek, bag, (o) => olaylar.push(o));
    expect(sonuc.dosyaId).toBe(ID);
    expect(sira).toEqual([
      'izin:image/jpeg:10',
      'put:http://s3.test/x:image/jpeg',
      'tamam',
      'durum',
      'durum',
    ]);
    expect(olaylar.map((o) => o.tur)).toEqual(['basla', 'kayit', 'ilerleme', 'yuklendi', 'hazir']);
  });

  it('yeniden denemede ayni istemci anahtarini kullanir; yukleme zaten bittiyse PUT atlanir', async () => {
    const put = vi.fn(() => Promise.resolve());
    const anahtarlar: string[] = [];
    const bag = bagimlilik({
      put,
      izinIste: (g) => {
        anahtarlar.push(g.istemci_anahtari);
        return Promise.resolve(izin('isleniyor', false));
      },
    });
    await dosyaYukle(secenek, bag, () => undefined);
    expect(anahtarlar).toEqual([secenek.istemciAnahtari]);
    expect(put).not.toHaveBeenCalled();
  });

  it('islenemedi yanitinda anlasilir hata kodu firlatir', async () => {
    const bag = bagimlilik({ durum: () => Promise.resolve(durumYaniti('islenemedi')) });
    await expect(dosyaYukle(secenek, bag, () => undefined)).rejects.toMatchObject({
      kod: 'islenemedi',
    });
  });

  it('tamam 409 yukleme_bulunamadi dondururse kisa aralikla yeniden dener', async () => {
    let n = 0;
    const bekle = vi.fn(() => Promise.resolve());
    const bag = bagimlilik({
      bekle,
      tamam: () => {
        n += 1;
        return n < 3
          ? Promise.reject(new UygulamaHatasi(409, 'yukleme_bulunamadi', 'x'))
          : Promise.resolve(durumYaniti('isleniyor'));
      },
    });
    await dosyaYukle(secenek, bag, () => undefined);
    expect(n).toBe(3);
    expect(bekle).toHaveBeenCalledWith(500);
  });

  it('yoklama siniri asilirsa zaman_asimi verir', async () => {
    const bag = bagimlilik({ durum: () => Promise.resolve(durumYaniti('isleniyor')) });
    await expect(
      dosyaYukle({ ...secenek, enFazlaYoklama: 3 }, bag, () => undefined),
    ).rejects.toBeInstanceOf(YuklemeHatasi);
  });

  it('iptal sinyali yuklemeyi durdurur', async () => {
    const iptal = new AbortController();
    iptal.abort();
    await expect(
      dosyaYukle({ ...secenek, sinyal: iptal.signal }, bagimlilik(), () => undefined),
    ).rejects.toMatchObject({ kod: 'iptal' });
  });
});

describe('dosyaHazirDegilDene', () => {
  it('409 dosya_hazir_degil icin kisa aralikla yeniden dener', async () => {
    let n = 0;
    const bekle = vi.fn(() => Promise.resolve());
    const sonuc = await dosyaHazirDegilDene(
      () => {
        n += 1;
        return n < 3
          ? Promise.reject(new UygulamaHatasi(409, 'dosya_hazir_degil', 'x'))
          : Promise.resolve('tamam');
      },
      bekle,
      8,
      600,
    );
    expect(sonuc).toBe('tamam');
    expect(n).toBe(3);
    expect(bekle).toHaveBeenCalledTimes(2);
    expect(bekle).toHaveBeenCalledWith(600);
  });

  it('deneme siniri dolunca ve baska hatalarda hemen firlatir', async () => {
    const hep = () => Promise.reject(new UygulamaHatasi(409, 'dosya_hazir_degil', 'x'));
    await expect(dosyaHazirDegilDene(hep, () => Promise.resolve(), 3)).rejects.toMatchObject({
      kod: 'dosya_hazir_degil',
    });
    const bekle = vi.fn(() => Promise.resolve());
    await expect(
      dosyaHazirDegilDene(() => Promise.reject(new UygulamaHatasi(429, 'kota_asildi', 'x')), bekle),
    ).rejects.toMatchObject({ kod: 'kota_asildi' });
    expect(bekle).not.toHaveBeenCalled();
  });
});

describe('hata esleme', () => {
  it('medya hata kodlarini yukleme mesaj anahtarlarina cevirir', () => {
    expect(yuklemeHataKodu(new UygulamaHatasi(413, 'dosya_cok_buyuk', 'x'))).toBe('cok_buyuk');
    expect(yuklemeHataKodu(new UygulamaHatasi(429, 'kota_asildi', 'x'))).toBe('depolama_kotasi');
    expect(yuklemeHataKodu(new UygulamaHatasi(0, 'ag', 'x'))).toBe('ag');
    expect(yuklemeHataKodu(new UygulamaHatasi(500, 'bilinmeyen', 'x'))).toBe('genel');
    expect(yuklemeHataKodu(new YuklemeHatasi('islenemedi'))).toBe('islenemedi');
    expect(yuklemeHataKodu(new Error('x'))).toBe('genel');
  });

  it('yalniz gecici hatalarda yeniden denemeyi onerir', () => {
    expect(yenidenDenenebilir('ag')).toBe(true);
    expect(yenidenDenenebilir('islenemedi')).toBe(true);
    expect(yenidenDenenebilir('cok_buyuk')).toBe(false);
    expect(yenidenDenenebilir('mime_desteklenmiyor')).toBe(false);
  });
});
