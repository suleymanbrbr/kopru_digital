import { describe, expect, it } from 'vitest';

import { istemciIpCoz } from './istemci-ip';
import { taklitYoluIzinliMi, yolIzinliMi } from './vekil';

const ID = '0190a000-0000-7000-8000-000000000001';

describe('vekil allowlist', () => {
  it.each([
    ['GET', 'ben'],
    ['POST', 'ikinci-adim/dogrula'],
    ['GET', 'kurumlar'],
    ['GET', `kurumlar/${ID}`],
    ['PUT', `kurumlar/${ID}/moduller/finans`],
    ['PUT', `kurumlar/${ID}/beta/yeni-rapor`],
    ['POST', 'taklit'],
    ['POST', `taklit/${ID}/sonlandir`],
    ['GET', 'denetim'],
    ['GET', 'sistem-sagligi'],
    ['POST', 'mesajlar'],
    ['POST', `mesajlar/${ID}/iptal`],
    ['GET', 'mufredat/kataloglar'],
    ['GET', 'mufredat/kataloglar/lgs/surumler/2/agac'],
    ['POST', 'mufredat/kataloglar/tyt/taslak'],
    ['POST', 'mufredat/kataloglar/ayt/taslak/yayinla'],
    ['POST', `mufredat/kataloglar/okul/taslak/konular/${ID}/birlestir`],
    ['GET', 'motivasyon/ayarlar'],
    ['PUT', 'motivasyon/ayarlar'],
    ['POST', 'motivasyon/ayarlar/geri-al'],
  ])('%s %s geçer', (yontem, yol) => {
    expect(yolIzinliMi(yol.split('/'), yontem)).toBe(true);
  });

  it.each([
    ['DELETE', `kurumlar/${ID}`],
    ['POST', 'kurumlar'],
    ['PUT', `kurumlar/${ID}/diger/x`],
    ['GET', 'ikinci-adim/kur'],
    ['GET', 'mufredat/kataloglar/bilinmeyen/surumler/1/agac'],
    ['POST', 'mufredat/kataloglar/lgs/taslak/konular/uuid-degil/kaldir'],
    ['GET', 'motivasyon/baska'],
    ['GET', 'yonetici-ekle'],
    ['PUT', 'kurumlar/../ben'],
  ])('%s %s reddedilir', (yontem, yol) => {
    expect(yolIzinliMi(yol.split('/'), yontem)).toBe(false);
  });

  it('yol atlatma ve boş parçalar reddedilir', () => {
    expect(yolIzinliMi([], 'GET')).toBe(false);
    expect(yolIzinliMi(['..', 'ben'], 'GET')).toBe(false);
    expect(yolIzinliMi(['ben', ''], 'GET')).toBe(false);
    expect(yolIzinliMi(['ben?x=1'], 'GET')).toBe(false);
    expect(yolIzinliMi(['%2e%2e'], 'GET')).toBe(false);
  });

  it('taklit okuma yalnız üç salt okunur uca izin verir', () => {
    expect(taklitYoluIzinliMi(['hesap', 'ben'])).toBe(true);
    expect(taklitYoluIzinliMi(['hesap', 'modul-ayarlari', 'etkin-tumu'])).toBe(true);
    expect(taklitYoluIzinliMi(['hesap', 'kurumlar', ID])).toBe(true);
    expect(taklitYoluIzinliMi(['hesap', 'gruplar'])).toBe(false);
    expect(taklitYoluIzinliMi(['ders', 'yoklama'])).toBe(false);
  });
});

describe('istemciIpCoz', () => {
  it('güvenilen proxy yoksa başlık göndermez', () => {
    expect(istemciIpCoz('1.2.3.4', 0)).toBeNull();
  });
  it('sağdan güvenilen sayıdaki değeri alır; geçersiz IP reddedilir', () => {
    expect(istemciIpCoz('9.9.9.9, 1.2.3.4', 1)).toBe('1.2.3.4');
    expect(istemciIpCoz('1.2.3.4, 10.0.0.1', 2)).toBe('1.2.3.4');
    expect(istemciIpCoz('hile', 1)).toBeNull();
    expect(istemciIpCoz(null, 1)).toBeNull();
  });
});
