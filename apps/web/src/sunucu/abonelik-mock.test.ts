import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  abonelikMock,
  MOCK_AKTIVASYON_GECIKMESI_MS,
  mockOdemeDonusu,
  mockOgrenciLimitiDolu,
  platformMesajiMock,
  senaryoCoz,
} from './abonelik-mock';

let sayac = 0;
let cerez = '';
const KURUM = 'kurum-kuzey';
const cagir = (yontem: string, yol: string, govde?: unknown) =>
  abonelikMock({
    yontem,
    yol: `kurumlar/${KURUM}/${yol}`,
    sorgu: new URLSearchParams(),
    govde,
    basliklar: {},
    kaynak: 'http://localhost:3000',
    senaryo: cerez,
  });
const govde = (y: { govde?: unknown }) => y.govde as Record<string, any>;

const fatura = {
  unvan: 'Kuzey Ltd.',
  vergi_no: '1111111114',
  adres: { satir: 'Moda Cd. 1', ilce: 'Kadıköy', il: 'İstanbul' },
  eposta: 'a@b.test',
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-19T09:00:00Z'));
  sayac += 1;
});
afterEach(() => {
  vi.useRealTimers();
});
const senaryo = (ad: string) => {
  cerez = `t${String(sayac)}:${ad}`;
};

describe('abonelik mock', () => {
  it('cerez cozumleme: gecersiz senaryo aktif', () => {
    expect(senaryoCoz(undefined)).toEqual({ anahtar: 'varsayilan', senaryo: 'aktif' });
    expect(senaryoCoz('a1:askida')).toEqual({ anahtar: 'a1', senaryo: 'askida' });
    expect(senaryoCoz('a1:yok')).toEqual({ anahtar: 'a1', senaryo: 'aktif' });
  });

  it('sahip olmayan kurum 403 izin_yok', () => {
    const y = abonelikMock({
      yontem: 'GET',
      yol: 'kurumlar/kurum-ege/abonelik',
      sorgu: new URLSearchParams(),
      govde: undefined,
      basliklar: {},
    });
    expect(y.durum).toBe(403);
  });

  it('askida: yazma kilitli, ucretsiz; platform-askida 403 kurum_askida', () => {
    senaryo('askida');
    const g = govde(cagir('GET', 'abonelik'));
    expect(g.yazma_kilitli).toBe(true);
    expect(g.ucretsiz).toBe(true);
    senaryo('platform-askida');
    const y = cagir('GET', 'abonelik');
    expect(y.durum).toBe(403);
    expect(govde(y).error.code).toBe('kurum_askida');
  });

  it('deneme: plan degistirme hemen uygulanir; aktifte donem sonuna kalir ve limit asimi doner', () => {
    senaryo('deneme');
    expect(govde(cagir('POST', 'abonelik/plan-degistir', { plan_kodu: 'koc' })).uygulama).toBe(
      'hemen',
    );
    senaryo('limit-dolu');
    const g = govde(cagir('POST', 'abonelik/plan-degistir', { plan_kodu: 'baslangic' }));
    expect(g.uygulama).toBe('donem_sonu');
    expect(g.abonelik.bekleyen_plan_kodu).toBe('baslangic');
    senaryo('aktif');
    const asim = govde(cagir('POST', 'abonelik/plan-degistir', { plan_kodu: 'baslangic' }));
    expect(asim.limit_asimlari).toEqual([{ limit: 'max_ogretmen', mevcut: 2, ust_sinir: 1 }]);
    expect(cagir('POST', 'abonelik/plan-degistir', { plan_kodu: 'yok' }).durum).toBe(404);
  });

  it('iptal: aktifte iptal istendi, magazada 409, ucretsizde 409', () => {
    senaryo('aktif');
    expect(govde(cagir('POST', 'abonelik/iptal')).abonelik.iptal_istendi_at).not.toBeNull();
    senaryo('magaza');
    expect(govde(cagir('POST', 'abonelik/iptal')).error.code).toBe('magaza_uzerinden_yonetilir');
    senaryo('ucretsiz');
    expect(govde(cagir('POST', 'abonelik/iptal')).error.code).toBe('etkin_abonelik_yok');
  });

  it('odeme baslat: fatura yoksa 422, magazada 409, aktif iyzico 409', () => {
    senaryo('deneme');
    expect(govde(cagir('POST', 'odeme/baslat', { plan_kodu: 'koc' })).error.code).toBe(
      'fatura_bilgisi_gerekli',
    );
    senaryo('magaza');
    const y = cagir('POST', 'odeme/baslat', { plan_kodu: 'koc' });
    expect(y.durum).toBe(409);
    expect(govde(y).error.details).toEqual({ kaynak: 'apple' });
    senaryo('aktif');
    expect(govde(cagir('POST', 'odeme/baslat', { plan_kodu: 'koc' })).error.code).toBe(
      'abonelik_zaten_aktif',
    );
  });

  it('deneme -> fatura -> odeme -> sahte donus -> gecikmeli aktivasyon', () => {
    senaryo('deneme');
    expect(cagir('PUT', 'fatura-bilgileri', { ...fatura, vergi_no: '12' }).durum).toBe(400);
    expect(cagir('PUT', 'fatura-bilgileri', fatura).durum).toBe(200);
    const b = govde(cagir('POST', 'odeme/baslat', { plan_kodu: 'koc', periyot: 'yillik' }));
    expect(b.tutar_kurus).toBe(718_800);
    expect(b.yonlendirme_url).toContain('/api/abonelik-mock/donus');
    expect(mockOdemeDonusu(cerez, 'basarili')).toBe('basarili');
    expect(govde(cagir('GET', 'abonelik')).abonelik.durum).toBe('deneme');
    vi.advanceTimersByTime(MOCK_AKTIVASYON_GECIKMESI_MS + 10);
    const sonra = govde(cagir('GET', 'abonelik'));
    expect(sonra.abonelik.durum).toBe('aktif');
    expect(sonra.abonelik.plan.kod).toBe('koc');
    expect(govde(cagir('GET', 'odemeler')).odemeler).toHaveLength(1);
    expect(govde(cagir('GET', 'faturalar')).faturalar[0].durum).toBe('kesildi');
    expect(mockOdemeDonusu(cerez, 'basarili')).toBe('bulunamadi');
  });

  it('limit-dolu: ogrenci limiti dolu; diger senaryolarda null', () => {
    senaryo('limit-dolu');
    expect(mockOgrenciLimitiDolu(cerez)).toEqual({
      limit: 'max_ogrenci',
      mevcut: 15,
      ust_sinir: 15,
    });
    senaryo('aktif');
    expect(mockOgrenciLimitiDolu(cerez)).toBeNull();
  });

  it('platform mesaji cerezi', () => {
    expect(platformMesajiMock(undefined).mesaj).toBeNull();
    expect(platformMesajiMock('kritik').mesaj?.onem).toBe('kritik');
  });
});
