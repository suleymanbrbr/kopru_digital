import type { OdakOturumu } from '@kopru/contracts';
import { describe, expect, it } from 'vitest';

import {
  gecenSaniye,
  kalanSaniye,
  odakGecis,
  planlananDk,
  serbestSureGecerliMi,
  sureBicimle,
  sureBittiMi,
  uuidv7Uret,
  type OdakDurumu,
  type OdakKazanimi,
} from './odak';

const oturum = (ek: Partial<OdakOturumu> = {}): OdakOturumu => ({
  id: '0190a000-0000-7000-8000-000000000001',
  istemci_id: '0190a000-0000-7000-8000-000000000002',
  baslangic_at: '2026-11-12T10:00:00.000Z',
  bitis_at: null,
  planlanan_dk: 25,
  gerceklesen_sn: 0,
  durum: 'devam',
  brans_kodu: null,
  plan_gorev_id: null,
  cihaz: 'web',
  ...ek,
});
const kazanim: OdakKazanimi = {
  xp: 25,
  seviye_atladi: false,
  yeni_rozetler: [],
  dogrulanmamis_sayilan_sn: 0,
  dogrulanmamis_sayilmayan_sn: 0,
};

describe('odakGecis (durum makinesi)', () => {
  const yukleniyor: OdakDurumu = { tur: 'yukleniyor' };

  it('acik oturum varsa devam, yoksa hazir', () => {
    expect(odakGecis(yukleniyor, { tur: 'acik_bulundu', oturum: oturum() })).toEqual({
      tur: 'devam',
      oturum: oturum(),
    });
    expect(odakGecis(yukleniyor, { tur: 'acik_bulundu', oturum: null })).toEqual({ tur: 'hazir' });
  });

  it('yukleme bittikten sonra gelen acik sorgusu durumu bozmaz', () => {
    const d: OdakDurumu = { tur: 'devam', oturum: oturum() };
    expect(odakGecis(d, { tur: 'acik_bulundu', oturum: null })).toBe(d);
  });

  it('baslat -> baslatildi -> bitir -> bitirildi -> yeni', () => {
    let d: OdakDurumu = { tur: 'hazir' };
    d = odakGecis(d, { tur: 'baslat', istemciId: 'x' });
    expect(d.tur).toBe('baslatiliyor');
    d = odakGecis(d, { tur: 'baslatildi', oturum: oturum() });
    expect(d.tur).toBe('devam');
    d = odakGecis(d, { tur: 'bitir', durum: 'tamam' });
    expect(d).toMatchObject({ tur: 'bitiriliyor', durum: 'tamam' });
    d = odakGecis(d, {
      tur: 'bitirildi',
      oturum: oturum({ durum: 'tamam' }),
      kazanim,
    });
    expect(d).toMatchObject({ tur: 'bitti', kazanim });
    expect(odakGecis(d, { tur: 'yeni' })).toEqual({ tur: 'hazir' });
  });

  it('hata durumlari bir onceki duruma doner', () => {
    expect(odakGecis({ tur: 'baslatiliyor', istemciId: 'x' }, { tur: 'baslatilamadi' })).toEqual({
      tur: 'hazir',
    });
    const b: OdakDurumu = { tur: 'bitiriliyor', oturum: oturum(), durum: 'yarida' };
    expect(odakGecis(b, { tur: 'bitirilemedi' })).toEqual({ tur: 'devam', oturum: oturum() });
  });

  it('gecersiz olaylar durumu degistirmez (cift tiklama)', () => {
    const hazir: OdakDurumu = { tur: 'hazir' };
    expect(odakGecis(hazir, { tur: 'bitir', durum: 'tamam' })).toBe(hazir);
    const devam: OdakDurumu = { tur: 'devam', oturum: oturum() };
    expect(odakGecis(devam, { tur: 'baslat', istemciId: 'y' })).toBe(devam);
    const bitiriliyor: OdakDurumu = { tur: 'bitiriliyor', oturum: oturum(), durum: 'tamam' };
    expect(odakGecis(bitiriliyor, { tur: 'bitir', durum: 'yarida' })).toBe(bitiriliyor);
  });

  it('409 acik_oturum_var: baslatiliyor iken baska oturum devam olarak alinir', () => {
    const d = odakGecis(
      { tur: 'baslatiliyor', istemciId: 'x' },
      { tur: 'baslatildi', oturum: oturum({ istemci_id: '0190a000-0000-7000-8000-0000000000ff' }) },
    );
    expect(d).toMatchObject({ tur: 'devam' });
  });
});

describe('sure hesaplari', () => {
  const o = oturum();
  const t0 = Date.parse(o.baslangic_at);

  it('gecen ve kalan saniye duvar saatinden turetilir (sekme kapaliyken de)', () => {
    expect(gecenSaniye(o, t0 + 90_000)).toBe(90);
    expect(kalanSaniye(o, t0 + 90_000)).toBe(25 * 60 - 90);
    expect(kalanSaniye(o, t0 - 5000)).toBe(25 * 60); // gelecekteki baslangic
  });

  it('sure dolunca kalan 0 ve sureBittiMi dogru', () => {
    expect(sureBittiMi(o, t0 + 25 * 60_000 - 1000)).toBe(false);
    expect(sureBittiMi(o, t0 + 25 * 60_000)).toBe(true);
    expect(kalanSaniye(o, t0 + 2 * 3600_000)).toBe(0);
  });

  it('sureBicimle', () => {
    expect(sureBicimle(1499)).toBe('24:59');
    expect(sureBicimle(0)).toBe('00:00');
    expect(sureBicimle(3905)).toBe('1:05:05');
    expect(sureBicimle(-4)).toBe('00:00');
  });

  it('serbest sure siniri 5-180 tam sayi', () => {
    expect(serbestSureGecerliMi(5)).toBe(true);
    expect(serbestSureGecerliMi(180)).toBe(true);
    expect(serbestSureGecerliMi(4)).toBe(false);
    expect(serbestSureGecerliMi(181)).toBe(false);
    expect(serbestSureGecerliMi(12.5)).toBe(false);
    expect(serbestSureGecerliMi(Number.NaN)).toBe(false);
  });

  it('planlananDk: sabit modlarda mod suresi, serbestte girilen', () => {
    expect(planlananDk('25_5', 99)).toBe(25);
    expect(planlananDk('50_10', 99)).toBe(50);
    expect(planlananDk('serbest', 33)).toBe(33);
  });
});

describe('uuidv7Uret', () => {
  it('gecerli bir UUIDv7 uretir ve zamana gore siralanir', () => {
    const a = uuidv7Uret(1_700_000_000_000);
    const b = uuidv7Uret(1_700_000_001_000);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
    expect(uuidv7Uret()).not.toBe(uuidv7Uret());
  });
});
