import { describe, expect, it } from 'vitest';

import { sorguMetni, YonetimHatasi } from './api';
import { hataAyrintilari, hataMetni } from './hata';

describe('hataMetni', () => {
  it.each([
    ['ikinci_adim_gerekli', /iki adımlı doğrulamayı tamamlayın/],
    ['platform_ip_yasak', /ağ adresinden/],
    ['platform_izin_yok', /yöneticisi rolü gerekir/],
    ['platform_yetkisi_yok', /yetkiniz yok/],
    ['ayar_gecersiz', /geçersiz/],
    ['surum_catismasi', /değişti/],
    ['cok_fazla_istek', /15 dakika/],
  ])('%s kodu Türkçe mesaja çevrilir', (kod, desen) => {
    expect(hataMetni(new YonetimHatasi(403, kod, 'english message'))).toMatch(desen);
  });

  it('bilinmeyen 4xx kodunda sunucu mesajını, 5xx ve bilinmeyende genel mesajı verir', () => {
    expect(hataMetni(new YonetimHatasi(409, 'yeni_kod', 'Çakışma var'))).toBe('Çakışma var');
    expect(hataMetni(new YonetimHatasi(500, 'yeni_kod', 'boom'))).toMatch(/Tekrar deneyin/);
    expect(hataMetni(new Error('x'))).toMatch(/Tekrar deneyin/);
  });

  it('ağ hatası (durum 0) ulaşılamadı mesajı verir', () => {
    expect(hataMetni(new YonetimHatasi(0, 'bilinmeyen', 'x'))).toMatch(/ulaşılamadı/);
  });
});

describe('alan hataları', () => {
  it('motivasyon details.hatalar biçimini okur', () => {
    const h = new YonetimHatasi(422, 'ayar_gecersiz', 'x', {
      hatalar: [{ alan: 'tavanlar.plan', mesaj: 'Alt tavan aşamaz.' }],
    });
    expect(h.alanHatalari).toEqual([{ alan: 'tavanlar.plan', mesaj: 'Alt tavan aşamaz.' }]);
    expect(hataAyrintilari(h)).toEqual(['tavanlar.plan: Alt tavan aşamaz.']);
  });

  it('Fastify doğrulama (path/message) biçimini okur', () => {
    const h = new YonetimHatasi(400, 'dogrulama_hatasi', 'x', [
      { path: 'neden', message: 'En az 10 karakter.' },
    ]);
    expect(h.alanHatalari).toEqual([{ alan: 'neden', mesaj: 'En az 10 karakter.' }]);
  });

  it('ayrıntı yoksa boş liste', () => {
    expect(new YonetimHatasi(500, 'x', 'y').alanHatalari).toEqual([]);
    expect(hataAyrintilari(new Error('x'))).toEqual([]);
  });
});

describe('sorguMetni', () => {
  it('boş değerleri atar, değerleri kodlar', () => {
    expect(sorguMetni({ q: 'ege ışık', durum: undefined, limit: 25, bos: '' })).toBe(
      '?q=ege+%C4%B1%C5%9F%C4%B1k&limit=25',
    );
    expect(sorguMetni()).toBe('');
  });
});
