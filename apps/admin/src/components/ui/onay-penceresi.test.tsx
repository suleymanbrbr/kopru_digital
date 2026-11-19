import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { OnayPenceresi } from './onay-penceresi';

import { YonetimHatasi } from '@/lib/api';

function ac(ek: Partial<Parameters<typeof OnayPenceresi>[0]> = {}) {
  const onOnayla = vi.fn();
  const onKapat = vi.fn();
  render(
    <OnayPenceresi
      acik
      baslik="Modülü kapat"
      onayEtiketi="Onayla"
      neden={{ min: 10 }}
      onOnayla={onOnayla}
      onKapat={onKapat}
      {...ek}
    />,
  );
  return { onOnayla, onKapat };
}

describe('OnayPenceresi', () => {
  it('neden en az 10 karakter olmadan onaylanamaz; onayda kırpılmış neden gelir', async () => {
    const { onOnayla } = ac();
    const onay = screen.getByRole('button', { name: 'Onayla' });
    expect(onay).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Neden/), '  kısa  ');
    expect(onay).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Neden/), ' ama yeterince uzun bir neden');
    expect(onay).toBeEnabled();
    await userEvent.click(onay);
    expect(onOnayla).toHaveBeenCalledWith('kısa   ama yeterince uzun bir neden');
  });

  it('neden istenmezse yalnız denetim notu gösterir ve doğrudan onaylanır', async () => {
    const { onOnayla } = ac({ neden: undefined });
    expect(screen.getByText('Bu işlem denetim kaydına yazılır.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Onayla' }));
    expect(onOnayla).toHaveBeenCalledOnce();
  });

  it('onay kutusu işaretlenmeden onaylanamaz', async () => {
    ac({ neden: undefined, onayKutusu: 'Anlıyorum' });
    const onay = screen.getByRole('button', { name: 'Onayla' });
    expect(onay).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Anlıyorum' }));
    expect(onay).toBeEnabled();
  });

  it('hata kodunu Türkçe mesaja, alan hatalarını listeye çevirir', () => {
    ac({
      neden: undefined,
      hata: new YonetimHatasi(422, 'ayar_gecersiz', 'x', {
        hatalar: [{ alan: 'tavanlar.plan', mesaj: 'Alt tavan aşamaz.' }],
      }),
    });
    const alarm = screen.getByRole('alert');
    expect(alarm).toHaveTextContent('Ayar değerleri geçersiz.');
    expect(alarm).toHaveTextContent('tavanlar.plan: Alt tavan aşamaz.');
  });

  it('bekleyen işlemde vazgeç kapalı, onay kapalı', () => {
    ac({ neden: undefined, bekliyor: true });
    expect(screen.getByRole('button', { name: 'Vazgeç' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Yükleniyor…' })).toBeDisabled();
  });
});
