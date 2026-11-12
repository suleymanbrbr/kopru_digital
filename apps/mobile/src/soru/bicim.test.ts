import { t } from '@kopru/i18n';

import type { SoruKotasi } from '../api/soruTipleri';
import { gonderimHataMesaji, kotaGorunumu, tahminMetni } from './bicim';

const kota = (kalan: number | null, sifirlanma = '2026-11-12T21:00:00.000Z'): SoruKotasi => ({
  gunlukLimit: 3,
  gunlukKullanilan: kalan === null ? 0 : 3 - kalan,
  gunlukKalan: kalan,
  gunlukSifirlanma: sifirlanma,
  aylikKalan: null,
  aylikSifirlanma: '2026-12-01T00:00:00.000Z',
});

describe('kota mesajlari', () => {
  const simdi = Date.parse('2026-11-12T10:00:00.000Z');

  it('kalan hakki gosterir', () => {
    const g = kotaGorunumu(kota(2), 0, 'Europe/Istanbul', simdi);
    expect(g.dolu).toBe(false);
    expect(g.kalan).toBe(2);
    expect(g.mesaj).toBe('Bugün 2 soru hakkın kaldı');
    expect(g.sifirlanma).toBeNull();
  });

  it('bekleyen gonderimleri kalandan dusur', () => {
    const g = kotaGorunumu(kota(1), 1, 'Europe/Istanbul', simdi);
    expect(g.dolu).toBe(true);
    expect(g.kalan).toBe(0);
  });

  it('dolunca acik mesaj ve sifirlanma zamani (kurum saatiyle) verir', () => {
    const g = kotaGorunumu(kota(0), 0, 'Europe/Istanbul', simdi);
    expect(g.dolu).toBe(true);
    expect(g.mesaj).toBe('Bugünkü soru hakkın doldu.');
    // 21:00Z = 00:00 Istanbul
    expect(g.sifirlanma).toBe('Hakkın yarın saat 00:00 civarı yenilenir.');
  });

  it('sinirsiz kota dolmaz', () => {
    const g = kotaGorunumu(kota(null), 5, 'Europe/Istanbul', simdi);
    expect(g.dolu).toBe(false);
    expect(g.kalan).toBeNull();
  });

  it('uzak sifirlanma tarihli yazilir', () => {
    const g = kotaGorunumu(kota(0, '2026-11-20T21:00:00.000Z'), 0, 'Europe/Istanbul', simdi);
    expect(g.sifirlanma).toContain('Hakkın');
    expect(g.sifirlanma).not.toContain('yarın');
  });
});

describe('tahmin ve hata metinleri', () => {
  it('sureyi dakika/saat olarak yazar', () => {
    expect(tahminMetni(30)).toBe('1 dk');
    expect(tahminMetni(1500)).toBe('25 dk');
    expect(tahminMetni(7200)).toBe('2 saat');
    expect(tahminMetni(5400)).toBe('1 saat 30 dk');
  });

  it('bilinen hata kodlarini cevirir, bilinmeyeni genel yapar', () => {
    expect(gonderimHataMesaji('kota_asildi')).toBe(t('mobil.soru.hata.kota_asildi'));
    expect(gonderimHataMesaji('bilinmeyen_kod')).toBe(t('mobil.soru.hata.genel'));
    expect(gonderimHataMesaji(undefined)).toBe(t('mobil.soru.hata.genel'));
  });
});
