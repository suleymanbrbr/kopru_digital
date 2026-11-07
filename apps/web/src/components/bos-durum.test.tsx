import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Inbox } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { BosDurum } from './bos-durum';
import { HataDurumu } from './hata-durumu';

describe('BosDurum', () => {
  it('baslik, aciklama ve eylemi gosterir', () => {
    render(
      <BosDurum ikon={Inbox} baslik="Ders yok" aciklama="Takvime ders ekle.">
        <button type="button">Takvime git</button>
      </BosDurum>,
    );
    expect(screen.getByRole('heading', { name: 'Ders yok' })).toBeInTheDocument();
    expect(screen.getByText('Takvime ders ekle.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Takvime git' })).toBeInTheDocument();
  });
});

describe('HataDurumu', () => {
  it('uyari olarak duyurulur, tekrar dene calisir ve hata kodunu gosterir', async () => {
    const tekrar = vi.fn();
    render(<HataDurumu tekrarDene={tekrar} istekNo="abc123" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Bu sayfa yüklenemedi');
    expect(screen.getByText('Hata kodu: abc123')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
    expect(tekrar).toHaveBeenCalledOnce();
  });
});
