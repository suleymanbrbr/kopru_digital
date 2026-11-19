import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { modulYolu, QrKod } from './qr-kod';

describe('QrKod', () => {
  it('modulYolu: ardışık modülleri tek yatay çizgide birleştirir', () => {
    expect(
      modulYolu([
        [true, true, false, true],
        [false, false, false, false],
        [false, true, true, true],
      ]),
    ).toBe('M0 0h2v1h-2zM3 0h1v1h-1zM1 2h3v1h-3z');
  });

  it('adresi sunucuya götürmeden erişilebilir bir SVG çizer', () => {
    render(<QrKod deger="otpauth://totp/Kopru:test?secret=JBSWY3DPEHPK3PXP&issuer=Kopru" />);
    const svg = screen.getByRole('img', { name: 'İki adımlı doğrulama QR kodu' });
    expect(svg.tagName.toLowerCase()).toBe('svg');
    const yol = svg.querySelector('path')?.getAttribute('d') ?? '';
    expect(yol.length).toBeGreaterThan(100);
    // Beyaz zemin: tema ne olursa olsun taranabilir.
    expect(svg).toHaveClass('bg-white');
  });
});
