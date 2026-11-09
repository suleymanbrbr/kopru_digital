import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BugunDersleriKarti } from './bugun-dersleri';

const durum = vi.hoisted(() => ({
  moduller: ['takvim'] as string[],
  rol: 'ogretmen',
  sorgu: {
    isPending: false,
    isError: false,
    dersler: [] as unknown[],
    refetch: () => undefined,
  },
}));

vi.mock('@/kurum/baglam', () => ({
  useKurum: () => ({
    uyelik: { kurumId: 'k1' },
    rol: durum.rol,
    acikModuller: durum.moduller,
  }),
}));
vi.mock('@/components/takvim/ders-verisi', () => ({ useAralikDersleri: () => durum.sorgu }));
vi.mock('@/lib/operasyon-verisi', () => ({
  useSaatDilimi: () => ({ saatDilimi: 'Europe/Istanbul', hazir: true }),
  useGruplar: () => ({
    adlar: new Map([['g1', { id: 'g1', tur: 'sinif', etiket: '9-A Sınıfı' }]]),
    secenekler: [],
  }),
  useOgretmenler: () => ({ adlar: new Map([['o1', 'Burcu Tekin']]), liste: [] }),
}));

const ders = (ek: Record<string, unknown>) => ({
  id: 'd1',
  grup_id: 'g1',
  ogretmen_id: 'o1',
  brans_kodu: 'matematik',
  baslik: null,
  durum: 'planli',
  baslangic_at: '2026-11-09T17:00:00.000Z',
  bitis_at: '2026-11-09T17:45:00.000Z',
  ...ek,
});

describe('Bugunku dersler karti', () => {
  beforeEach(() => {
    durum.moduller = ['takvim'];
    durum.rol = 'ogretmen';
    durum.sorgu = { isPending: false, isError: false, dersler: [], refetch: () => undefined };
  });

  it('ders yokken ne yapacagini anlatan bos durumu gosterir', () => {
    render(<BugunDersleriKarti />);
    expect(screen.getByText('Bugün için planlanmış ders yok')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Takvime git' })).toBeInTheDocument();
  });

  it('dersler varken bos durumu GOSTERMEZ; saat kurum diliminde, ad ve durum gorunur', () => {
    durum.sorgu = { ...durum.sorgu, dersler: [ders({ baslik: 'Geometri' })] };
    render(<BugunDersleriKarti />);
    expect(screen.queryByText('Bugün için planlanmış ders yok')).not.toBeInTheDocument();
    expect(screen.getByText('20:00-20:45')).toBeInTheDocument();
    expect(screen.getByText('9-A Sınıfı · Geometri')).toBeInTheDocument();
    expect(screen.getByText('Planlı')).toBeInTheDocument();
  });

  it('dersleri saat sirasina dizer; yonetici ogretmen adini da gorur', () => {
    durum.rol = 'yonetici';
    durum.sorgu = {
      ...durum.sorgu,
      dersler: [
        ders({
          id: 'b',
          baslangic_at: '2026-11-09T18:00:00.000Z',
          bitis_at: '2026-11-09T19:00:00.000Z',
        }),
        ders({ id: 'a', durum: 'tamamlandi' }),
      ],
    };
    render(<BugunDersleriKarti />);
    const saatler = screen.getAllByText(/^\d\d:\d\d-\d\d:\d\d$/).map((e) => e.textContent);
    expect(saatler).toEqual(['20:00-20:45', '21:00-22:00']);
    expect(screen.getAllByText('Burcu Tekin')).toHaveLength(2);
    expect(screen.getByText('Yoklaması alındı')).toBeInTheDocument();
  });

  it('yukleniyor ve hata hallerini gosterir', () => {
    durum.sorgu = { ...durum.sorgu, isPending: true };
    const { unmount } = render(<BugunDersleriKarti />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    unmount();
    durum.sorgu = { ...durum.sorgu, isPending: false, isError: true };
    render(<BugunDersleriKarti />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('takvim modulu kapaliysa hic cizilmez', () => {
    durum.moduller = [];
    const { container } = render(<BugunDersleriKarti />);
    expect(container).toBeEmptyDOMElement();
  });
});
