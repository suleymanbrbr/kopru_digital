import { describe, expect, it } from 'vitest';

import { duyuruHedefEtiketi, yayinOnayMetni } from './etiket';
import { duyuruHataMesaji } from './veri';

import { UygulamaHatasi } from '@/lib/api';

const G = '0198e7a0-0000-7000-8000-000000000001';

describe('duyuruHataMesaji', () => {
  it('duyuru hata kodlari i18n metnine cevrilir', () => {
    const mesaj = (durum: number, kod: string) =>
      duyuruHataMesaji(new UygulamaHatasi(durum, kod, 'ham mesaj'));
    expect(mesaj(403, 'modul_kapali')).toBe('Duyuru özelliği bu hedefte kapalı.');
    expect(mesaj(403, 'izin_yok')).toBe('Duyuru yazma yetkin yok.');
    expect(mesaj(403, 'yasak')).toBe('Bu hedefe duyuru yapma yetkin yok.');
    expect(mesaj(409, 'cakisma')).toBe('Duyuru bu durumda değiştirilemez.');
    expect(mesaj(404, 'bulunamadi')).toBe('Duyuru bulunamadı.');
  });

  it('bilinmeyen hata genel metne duser, ham sunucu mesajini sizdirmaz', () => {
    const m = duyuruHataMesaji(new UygulamaHatasi(500, 'sunucu_hatasi', 'SELECT * FROM'));
    expect(m).not.toContain('SELECT');
    expect(duyuruHataMesaji(new Error('x'))).toBe(m);
  });
});

describe('duyuruHedefEtiketi ve yayinOnayMetni', () => {
  const adlar = new Map([[G, { etiket: '9-A Sınıfı' }]]);

  it('hedef etiketi turune gore; bilinmeyen grup genel etiket', () => {
    expect(duyuruHedefEtiketi({ hedef_turu: 'grup', hedef_id: G }, adlar)).toBe('Grup: 9-A Sınıfı');
    expect(duyuruHedefEtiketi({ hedef_turu: 'grup', hedef_id: 'x' }, adlar)).toBe('Grup');
    expect(duyuruHedefEtiketi({ hedef_turu: 'kurum', hedef_id: G }, adlar)).toBe('Tüm kurum');
    expect(duyuruHedefEtiketi({ hedef_turu: 'kademe', hedef_id: G }, adlar)).toBe('Kademe');
  });

  it('kisi sayisi yalniz grup ve yalniz ogrenci aliciysa verilir', () => {
    const temel = { baslik: 'Sınav', hedef: '9-A Sınıfı' };
    expect(yayinOnayMetni({ ...temel, roller: ['ogrenci'], uyeSayisi: 6 })).toContain(
      'yaklaşık 6 öğrenciye',
    );
    expect(yayinOnayMetni({ ...temel, roller: ['ogrenci', 'ogretmen'], uyeSayisi: 6 })).not.toMatch(
      /yaklaşık/,
    );
    expect(yayinOnayMetni({ ...temel, roller: ['ogrenci'], uyeSayisi: null })).not.toMatch(
      /yaklaşık/,
    );
  });
});
