import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RizaEkrani } from './riza-ekrani';

const rizaKabul = vi.fn().mockResolvedValue(undefined);
vi.mock('@/oturum/saglayici', () => ({
  useOturum: () => ({ rizaKabul, cikis: vi.fn() }),
}));

const metin = {
  surum: '2026-11',
  baslik: 'Aydınlatma metni',
  bolumler: [{ baslik: 'Veri sorumlusu', metin: 'Kurum.' }],
  metinIdleri: ['metin-1'],
};

function goster(sonra = vi.fn()) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <RizaEkrani sonra={sonra} />
    </QueryClientProvider>,
  );
  return sonra;
}

afterEach(() => {
  vi.unstubAllGlobals();
  rizaKabul.mockClear();
});

describe('RizaEkrani', () => {
  it('onay kutusu isaretlenene kadar kabul dugmesi kapalidir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(metin)));
    const sonra = goster();
    expect(await screen.findByRole('heading', { name: 'Veri sorumlusu' })).toBeInTheDocument();

    const kabul = screen.getByRole('button', { name: 'Kabul et ve devam et' });
    expect(kabul).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: /Aydınlatma metnini okudum/ }));
    expect(kabul).toBeEnabled();
    await userEvent.click(kabul);

    await waitFor(() => {
      expect(rizaKabul).toHaveBeenCalledWith({ surum: '2026-11', metinIdleri: ['metin-1'] });
    });
    expect(sonra).toHaveBeenCalled();
  });

  it('metin yuklenemezse hata durumu ve tekrar dene gosterir', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: { code: 'sunucu_hatasi', message: 'x' } }, { status: 500 }),
        ),
    );
    goster();
    expect(await screen.findByText('Aydınlatma metni yüklenemedi.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });
});
