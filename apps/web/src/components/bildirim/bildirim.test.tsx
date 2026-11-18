import type { BildirimKutuOgesi } from '@kopru/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BildirimSatiri } from './bildirim-satiri';
import { rozetMetni } from './bildirim-zili';

const oge = (ek: Partial<BildirimKutuOgesi> = {}): BildirimKutuOgesi => ({
  id: '0199aaaa-0000-7000-8000-000000000001',
  kategori: 'soru',
  sablon_kodu: 'soru_cevaplandi',
  baslik: 'Sorun cevaplandı',
  govde: 'Sorduğun soruya cevap geldi.',
  derin_baglanti: 'kopru://soru/s1',
  veri: {},
  okundu_at: null,
  gecerlilik_bitis_at: null,
  created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  ...ek,
});

describe('BildirimSatiri', () => {
  it('rolune gore derin baglantiya gider, okunmamis isareti ve goreli zaman gosterir', () => {
    const { rerender } = render(
      <ul>
        <BildirimSatiri oge={oge()} kurumId="k1" rol="ogrenci" tiklandi={vi.fn()} />
      </ul>,
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/k1/soru-sor/s1');
    expect(screen.getByText('Okunmamış')).toBeInTheDocument();
    expect(screen.getByText('5 dk önce')).toBeInTheDocument();
    expect(screen.getByText('Soru sor')).toBeInTheDocument();

    rerender(
      <ul>
        <BildirimSatiri
          oge={oge({ okundu_at: new Date().toISOString() })}
          kurumId="k1"
          rol="ogretmen"
          tiklandi={vi.fn()}
        />
      </ul>,
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/k1/sorular/s1');
    expect(screen.queryByText('Okunmamış')).toBeNull();
  });

  it('bilinmeyen baglanti bildirimler sayfasinda kalir; tiklama ve dugmeler cagrilir', async () => {
    const tiklandi = vi.fn();
    const okundu = vi.fn();
    const arsivle = vi.fn();
    render(
      <ul>
        <BildirimSatiri
          oge={oge({ derin_baglanti: 'kopru://yeni/bilinmeyen' })}
          kurumId="k1"
          rol="ogrenci"
          tiklandi={tiklandi}
          okunduIsaretle={okundu}
          arsivle={arsivle}
        />
      </ul>,
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/k1/bildirimler');
    const k = userEvent.setup();
    await k.click(screen.getByRole('button', { name: /okundu işaretle/ }));
    await k.click(screen.getByRole('button', { name: /arşivle/ }));
    expect(okundu).toHaveBeenCalledWith('0199aaaa-0000-7000-8000-000000000001');
    expect(arsivle).toHaveBeenCalledWith('0199aaaa-0000-7000-8000-000000000001');
    expect(tiklandi).not.toHaveBeenCalled();
  });

  it('okunmus bildirimde okundu dugmesi gosterilmez', () => {
    render(
      <ul>
        <BildirimSatiri
          oge={oge({ okundu_at: new Date().toISOString() })}
          kurumId="k1"
          rol="ogrenci"
          tiklandi={vi.fn()}
          okunduIsaretle={vi.fn()}
          arsivle={vi.fn()}
        />
      </ul>,
    );
    expect(screen.queryByRole('button', { name: /okundu işaretle/ })).toBeNull();
    expect(screen.getByRole('button', { name: /arşivle/ })).toBeInTheDocument();
  });
});

describe('rozetMetni', () => {
  it('99dan fazlasi 99+ olur', () => {
    expect(rozetMetni(3)).toBe('3');
    expect(rozetMetni(99)).toBe('99');
    expect(rozetMetni(100)).toBe('99+');
  });
});
