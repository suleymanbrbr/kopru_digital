import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PlanLimitiPenceresi } from './plan-limiti-penceresi';

import { KurumKutusu, type KurumBaglami } from '@/kurum/baglam';

function goster(rol: KurumBaglami['rol']) {
  const baglam: KurumBaglami = {
    uyelik: { id: 'u1', kurumId: 'kurum-x', kurumAd: 'K', rol, vurguRengi: null },
    rol,
    kullaniciAd: 'E',
    acikModuller: [],
  };
  return render(
    <KurumKutusu value={baglam}>
      <PlanLimitiPenceresi
        limit={{ limit: 'max_ogrenci', mevcut: 15, ust_sinir: 15 }}
        degisti={vi.fn()}
      />
    </KurumKutusu>,
  );
}

describe('PlanLimitiPenceresi', () => {
  it('sahibe abonelik baglantisi gosterir', () => {
    goster('sahip');
    expect(screen.getByRole('dialog', { name: 'Planını yükselt' })).toBeInTheDocument();
    expect(screen.getByText(/öğrenci sınırına ulaştın: 15 \/ 15/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Planı yükselt' })).toHaveAttribute(
      'href',
      '/kurum-x/abonelik',
    );
  });
  it('diger rollere kurum sahibine bildirme metni gosterir, baglanti yok', () => {
    goster('yonetici');
    expect(screen.getByText(/kurum sahibine bildir/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
