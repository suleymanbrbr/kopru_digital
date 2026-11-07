import type { ModulKodu } from '@kopru/contracts';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { UygulamaKabugu } from './uygulama-kabugu';

import { KurumKutusu, type KurumBaglami } from '@/kurum/baglam';

vi.mock('next/navigation', () => ({
  usePathname: () => '/kurum-x/bugun',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));
vi.mock('@/oturum/saglayici', () => ({ useOturum: () => ({ cikis: vi.fn() }) }));

function goster(rol: KurumBaglami['rol'], acikModuller: ModulKodu[]) {
  const baglam: KurumBaglami = {
    uyelik: { id: 'u1', kurumId: 'kurum-x', kurumAd: 'Deneme Kurumu', rol, vurguRengi: null },
    rol,
    kullaniciAd: 'Elif Yılmaz',
    acikModuller,
  };
  return render(
    <KurumKutusu value={baglam}>
      <UygulamaKabugu>
        <h1>Icerik</h1>
      </UygulamaKabugu>
    </KurumKutusu>,
  );
}

describe('UygulamaKabugu', () => {
  it('rolun menusunu cizer ve etkin sayfayi aria-current ile isaretler', () => {
    goster('ogretmen', ['takvim', 'finans']);
    const menu = screen.getAllByRole('navigation', { name: 'Ana menü' })[0];
    if (!menu) throw new Error('menu yok');
    const bugun = within(menu).getByRole('link', { name: 'Bugün' });
    expect(bugun).toHaveAttribute('aria-current', 'page');
    expect(bugun).toHaveAttribute('href', '/kurum-x/bugun');
    expect(within(menu).getByRole('link', { name: 'Finans' })).toBeInTheDocument();
    expect(within(menu).queryByRole('link', { name: 'Denemeler' })).toBeNull();
  });

  it('mobil alt menu ve Menu dugmesi bulunur; icerik main icinde', () => {
    goster('ogrenci', ['odev', 'soru_sor', 'oyunlastirma', 'kayitlar']);
    const alt = screen.getByRole('navigation', { name: 'Alt menü' });
    expect(within(alt).getAllByRole('link').length).toBeLessThanOrEqual(4);
    expect(within(alt).getByRole('button', { name: 'Menü' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('main')).getByRole('heading', { name: 'Icerik' }),
    ).toBeInTheDocument();
  });

  it('kurum degistirici kurum adini ve rolu gosterir', () => {
    goster('yonetici', []);
    expect(screen.getAllByText('Deneme Kurumu').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Yönetici').length).toBeGreaterThan(0);
  });
});
