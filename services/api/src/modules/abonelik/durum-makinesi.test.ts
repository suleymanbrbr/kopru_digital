import { describe, expect, it } from 'vitest';

import { gecisZinciri, sonrakiGecis, type GecisGirdisi } from './durum-makinesi.js';
import { SahteOdemeSaglayici } from './saglayici.js';

const GUN = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-12-01T10:00:00Z');
const t = (gun: number) => new Date(T0.getTime() + gun * GUN);

const satir = (ek: Partial<GecisGirdisi>): GecisGirdisi => ({
  durum: 'aktif',
  donem_bitis_at: T0,
  deneme_bitis_at: null,
  ek_sure_bitis_at: null,
  iptal_istendi_at: null,
  ...ek,
});

describe('abonelik durum makinesi (saf)', () => {
  it('deneme: bitise kadar degismez; bitince sona_erdi', () => {
    const d = satir({ durum: 'deneme', donem_bitis_at: t(14), deneme_bitis_at: t(14) });
    expect(sonrakiGecis(d, t(13.99))).toBeNull();
    expect(sonrakiGecis(d, t(14))).toMatchObject({ yeniDurum: 'sona_erdi', neden: 'deneme_bitti' });
    expect(sonrakiGecis(d, t(40))?.yeniDurum).toBe('sona_erdi');
  });

  it('aktif: donem icinde degismez; donem sonunda iptal istenmisse iptal, yoksa odeme_bekliyor', () => {
    const d = satir({ donem_bitis_at: t(30) });
    expect(sonrakiGecis(d, t(29))).toBeNull();
    expect(sonrakiGecis(d, t(30))?.yeniDurum).toBe('odeme_bekliyor');
    expect(sonrakiGecis({ ...d, iptal_istendi_at: t(5) }, t(29))).toBeNull();
    expect(sonrakiGecis({ ...d, iptal_istendi_at: t(5) }, t(30))).toMatchObject({
      yeniDurum: 'iptal',
      neden: 'iptal_donem_sonu',
    });
  });

  it('odeme_bekliyor: donem bitince ek_sure (donem bitisinden 7 gun)', () => {
    const d = satir({ durum: 'odeme_bekliyor', donem_bitis_at: t(30) });
    expect(sonrakiGecis(d, t(29))).toBeNull();
    const g = sonrakiGecis(d, t(31));
    expect(g?.yeniDurum).toBe('ek_sure');
    expect(g?.ekSureBitisAt?.getTime()).toBe(t(37).getTime());
  });

  it('ek_sure: bitince askida; askida: 90 gun sonra sona_erdi (askiya gecis = ek sure bitisi)', () => {
    const e = satir({ durum: 'ek_sure', donem_bitis_at: t(30), ek_sure_bitis_at: t(37) });
    expect(sonrakiGecis(e, t(36.9))).toBeNull();
    expect(sonrakiGecis(e, t(37))?.yeniDurum).toBe('askida');
    const a = { ...e, durum: 'askida' as const };
    expect(sonrakiGecis(a, t(37 + 89.9))).toBeNull();
    expect(sonrakiGecis(a, t(37 + 90))?.yeniDurum).toBe('sona_erdi');
    // ek sure tarihi yoksa donem bitisinden sayilir
    const b = satir({ durum: 'askida', donem_bitis_at: t(30) });
    expect(sonrakiGecis(b, t(30 + 89))).toBeNull();
    expect(sonrakiGecis(b, t(30 + 90))?.yeniDurum).toBe('sona_erdi');
  });

  it('iptal ve sona_erdi son durumdur', () => {
    for (const durum of ['iptal', 'sona_erdi'] as const) {
      expect(sonrakiGecis(satir({ durum }), t(1000))).toBeNull();
    }
  });

  it('zincir: uzun kapali kalan worker aktif satiri tek calismada askidaya kadar ilerletir; ayni girdi ayni sonuc', () => {
    const d = satir({ donem_bitis_at: t(30) });
    expect(gecisZinciri(d, t(29))).toEqual([]);
    const adimlar = gecisZinciri(d, t(31));
    expect(adimlar.map((a) => a.yeniDurum)).toEqual(['odeme_bekliyor', 'ek_sure']);
    const uzun = gecisZinciri(d, t(40));
    expect(uzun.map((a) => a.yeniDurum)).toEqual(['odeme_bekliyor', 'ek_sure', 'askida']);
    expect(gecisZinciri(d, t(40))).toEqual(uzun);
    const cokUzun = gecisZinciri(d, t(200));
    expect(cokUzun.map((a) => a.yeniDurum)).toEqual([
      'odeme_bekliyor',
      'ek_sure',
      'askida',
      'sona_erdi',
    ]);
    // Idempotent: son durumdan tekrar calistirmak bir sey yapmaz.
    expect(gecisZinciri({ ...d, durum: 'sona_erdi' }, t(200))).toEqual([]);
  });
});

describe('SahteOdemeSaglayici', () => {
  const s = new SahteOdemeSaglayici('gizli');
  const govde = JSON.stringify({
    id: 'evt_1',
    tur: 'odeme',
    abonelik_id: 'sub_1',
    odeme: {
      durum: 'basarili',
      tutar_kurus: 35880,
      donem_baslangic_at: '2026-12-01T00:00:00Z',
      donem_bitis_at: '2027-01-01T00:00:00Z',
    },
  });

  it('imza dogrulama ve ayristirma', () => {
    expect(s.webhookDogrula(govde, { 'x-sahte-imza': s.imzala(govde) })).toBe(true);
    expect(s.webhookDogrula(govde, { 'x-sahte-imza': s.imzala(govde + ' ') })).toBe(false);
    expect(s.webhookDogrula(govde, {})).toBe(false);
    const a = s.webhookAyristir(govde);
    expect(a).toMatchObject({ disOlayId: 'evt_1', disAbonelikId: 'sub_1' });
    expect(a.odeme).toMatchObject({ durum: 'basarili', tutarKurus: 35880 });
    expect(a.odeme?.donemBitisAt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});
