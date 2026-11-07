import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GirisAkisi } from './giris-akisi';

const kodIste = vi.fn();
vi.mock('@/oturum/saglayici', () => ({
  useOturum: () => ({ kodIste, kodDogrula: vi.fn() }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

describe('GirisAkisi', () => {
  beforeEach(() => {
    kodIste.mockReset();
  });

  it('gecersiz numarada hata gosterir ve kod istemez', async () => {
    render(<GirisAkisi denemeIpucu={false} />);
    await userEvent.type(screen.getByLabelText('Telefon numaran'), '123');
    await userEvent.click(screen.getByRole('button', { name: 'Kod gönder' }));
    expect(await screen.findByText(/Geçerli bir cep telefonu/)).toBeInTheDocument();
    expect(kodIste).not.toHaveBeenCalled();
  });

  it('numarayi bicimlendirir ve gecerliyse kod ekranina gecer', async () => {
    kodIste.mockResolvedValue({ yenidenSn: 30 });
    render(<GirisAkisi denemeIpucu />);
    const girdi = screen.getByLabelText('Telefon numaran');
    await userEvent.type(girdi, '5321234567');
    expect(girdi).toHaveValue('532 123 45 67');
    expect(screen.getByText(/Deneme ortamındasın/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Kod gönder' }));
    await waitFor(() => {
      expect(kodIste).toHaveBeenCalledWith('532 123 45 67');
    });
    expect(await screen.findByText(/numarasına 6 haneli bir kod gönderdik/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Yeni kod için 30 sn bekle/ })).toBeDisabled();
  });
});
