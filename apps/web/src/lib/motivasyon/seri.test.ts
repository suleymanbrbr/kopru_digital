import type { MotivasyonSeriDetayi } from '@kopru/contracts';
import { describe, expect, it } from 'vitest';

import {
  gunGosterimi,
  gunKisa,
  haftalaraBol,
  hedefKalanMetni,
  onarimMetni,
  seriMesaji,
  takvimOzeti,
} from './seri';

const hedef = (
  tur: 'plan_gorevi' | 'odak_dk' | 'odev' | 'soru',
  yapilan: number,
  esik: number,
) => ({
  tur,
  yapilan,
  esik,
  kalan: Math.max(0, esik - yapilan),
});

describe('gunGosterimi', () => {
  it('durumlari metinle ve simgeyle verir (renge dayanmaz)', () => {
    expect(gunGosterimi('aktif')).toMatchObject({ simge: 'tik', etiket: 'Çalışılan gün' });
    expect(gunGosterimi('dondurma')).toMatchObject({
      simge: 'kar',
      etiket: 'Dondurma kullanıldı',
    });
    expect(gunGosterimi('duraklatma')).toMatchObject({
      simge: 'duraklat',
      etiket: 'Öğretmenin arası',
    });
    expect(gunGosterimi('onarim')).toMatchObject({ simge: 'onarim', etiket: 'Kurtarıldı' });
  });

  it('yok ve kacirildi gunleri suclayici anlatilmaz', () => {
    for (const d of ['yok', 'kacirildi'] as const) {
      const g = gunGosterimi(d);
      expect(g.etiket.toLocaleLowerCase('tr')).not.toMatch(/kaçırd|kaçır|başarısız|bozdun/);
      expect(g.simge).toBe('nokta');
    }
    expect(gunGosterimi('yok').etiket).toBe('Kayıt yok');
  });
});

describe('seriMesaji', () => {
  it('suren varsa gun sayisini soyler', () => {
    expect(seriMesaji({ mevcut_seri: 15, en_uzun_seri: 23, bugun_aktif: false })).toBe(
      '15 günlük serindesin',
    );
  });
  it('seri sifirlanmissa rekoru ve yeni baslangici soyler (suclama yok)', () => {
    expect(seriMesaji({ mevcut_seri: 0, en_uzun_seri: 23, bugun_aktif: false })).toBe(
      'Rekorun 23 gün. Yeni seri bugün başlıyor.',
    );
  });
  it('hic seri yoksa davet eder', () => {
    expect(seriMesaji({ mevcut_seri: 0, en_uzun_seri: 0, bugun_aktif: false })).toBe(
      'İlk serini bugün başlatabilirsin.',
    );
  });
});

describe('onarimMetni', () => {
  it('pencere kapaliysa null', () => {
    expect(onarimMetni({ onarim: null })).toBeNull();
  });
  it('"Seriyi kurtarmak icin bugun ..." cumlesi kurar; herhangi bir hedef yeter', () => {
    const m = onarimMetni({
      onarim: {
        bozulan_gun: '2026-11-11',
        bozulan_seri: 15,
        bitis_at: '2026-11-13T01:00:00.000Z',
        hedefler: [hedef('plan_gorevi', 0, 2), hedef('odak_dk', 10, 40)],
      },
    });
    expect(m).toContain('Seriyi kurtarmak için bugün');
    expect(m).toContain('2 plan görevi tamamla');
    expect(m).toContain('30 dk odaklan');
    expect(m).toContain('ya da');
    expect(m).toContain('15 günlük');
  });
});

describe('hedefKalanMetni', () => {
  it('her hedef turu icin ne kaldigini yazar', () => {
    expect(hedefKalanMetni(hedef('odak_dk', 8, 20))).toBe('12 dk odaklan');
    expect(hedefKalanMetni(hedef('odev', 0, 1))).toBe('1 ödev teslim et');
  });
});

describe('takvim yardimcilari', () => {
  it('haftalara boler', () => {
    const b = haftalaraBol(Array.from({ length: 35 }, (_, i) => i));
    expect(b).toHaveLength(5);
    expect(b[0]).toHaveLength(7);
    expect(haftalaraBol([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });

  it('takvim ozeti durumlari sayar', () => {
    const gunler = [
      { gun: '2026-11-10', durum: 'aktif', bugun: false },
      { gun: '2026-11-11', durum: 'aktif', bugun: false },
      { gun: '2026-11-12', durum: 'dondurma', bugun: false },
      { gun: '2026-11-13', durum: 'yok', bugun: true },
    ] as MotivasyonSeriDetayi['gunler'];
    const o = takvimOzeti(gunler);
    expect(o).toContain('Son 4 günde 2 gün çalıştın');
    expect(o).toContain('1 gün dondurma');
  });

  it('gunKisa tarihi Turkce yazar', () => {
    expect(gunKisa('2026-11-12')).toBe('12 Kasım');
  });
});
