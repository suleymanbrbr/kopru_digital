import {
  SES_EN_FAZLA_SN,
  kalanSn,
  kayitKullanilabilirMi,
  kayitSuresiSn,
  sinirAsildiMi,
  sureMetni,
} from './sinirlar';

describe('ses sureleri', () => {
  it('sure metni m:ss', () => {
    expect(sureMetni(0)).toBe('0:00');
    expect(sureMetni(65)).toBe('1:05');
    expect(sureMetni(180)).toBe('3:00');
    expect(sureMetni(-4)).toBe('0:00');
  });

  it('180 sn sinirinda durur', () => {
    expect(SES_EN_FAZLA_SN).toBe(180);
    expect(sinirAsildiMi(179.9)).toBe(false);
    expect(sinirAsildiMi(180)).toBe(true);
    expect(kalanSn(100.2)).toBe(80);
    expect(kalanSn(200)).toBe(0);
  });

  it('api suresi 1..180 tam sayidir', () => {
    expect(kayitSuresiSn(0.2)).toBe(1);
    expect(kayitSuresiSn(61.4)).toBe(61);
    expect(kayitSuresiSn(181.5)).toBe(180);
  });

  it('cok kisa kayit kullanilamaz', () => {
    expect(kayitKullanilabilirMi(0.4)).toBe(false);
    expect(kayitKullanilabilirMi(3)).toBe(true);
  });
});
