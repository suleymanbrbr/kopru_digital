import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KurumListesi } from './kurum-listesi';

import type { Oturum, Uyelik } from '@/oturum/tipler';

const yenile = vi.fn().mockResolvedValue(undefined);
const push = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/oturum/saglayici', () => ({
  useOturum: () => ({ yenile, cikis: vi.fn() }),
}));

const u = (
  id: string,
  kurumId: string,
  rol: Uyelik['rol'],
  kurumTur: Uyelik['kurumTur'],
): Uyelik => ({
  id,
  kurumId,
  kurumAd: `Kurum ${kurumId}`,
  rol,
  kurumTur,
  vurguRengi: null,
});
const oturum = (uyelikler: Uyelik[]): Oturum => ({
  erisimBelirteci: 't',
  bitisAt: '2030-01-01T00:00:00Z',
  kullanici: { id: 'k', ad: 'Hoca', telefon: '+905321234567' },
  uyelikler,
  aktifUyelikId: null,
  rizaGerekli: false,
});

describe('kurum secimi ekrani', () => {
  beforeEach(() => {
    yenile.mockClear();
    push.mockClear();
  });

  it('tek bireysel kurumda secim atlanir ve sahip uyeligiyle acilir', async () => {
    render(
      <KurumListesi
        oturum={oturum([
          u('o', 'solo', 'ogretmen', 'bireysel'),
          u('s', 'solo', 'sahip', 'bireysel'),
        ])}
      />,
    );
    await waitFor(() => {
      expect(yenile).toHaveBeenCalledWith({ uyelikId: 's' });
    });
    expect(yenile).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/solo/bugun');
    });
  });

  it('birden cok kurumda bireysel kurum tek satirdir (sahip), digerleri aynen listelenir', () => {
    render(
      <KurumListesi
        oturum={oturum([
          u('o', 'solo', 'ogretmen', 'bireysel'),
          u('s', 'solo', 'sahip', 'bireysel'),
          u('m', 'okul', 'ogretmen', 'kurum'),
        ])}
      />,
    );
    const dugmeler = screen.getAllByRole('button', { name: /Bu kurumla devam et/ });
    expect(dugmeler).toHaveLength(2);
    expect(dugmeler[0]).toHaveAccessibleName(/Kurum solo, Kurum sahibi/);
    expect(dugmeler[1]).toHaveAccessibleName(/Kurum okul, Öğretmen/);
    expect(yenile).not.toHaveBeenCalled();
  });

  it('tek ama bireysel olmayan kurumda secim ekrani gosterilir', () => {
    render(<KurumListesi oturum={oturum([u('m', 'okul', 'ogretmen', 'kurum')])} />);
    expect(screen.getByRole('button', { name: /Bu kurumla devam et/ })).toBeInTheDocument();
    expect(yenile).not.toHaveBeenCalled();
  });
});
