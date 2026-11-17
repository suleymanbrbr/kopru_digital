import type { MotivasyonSeriDetayi } from '@kopru/contracts';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Ilerleme } from './ortak';
import { RadarGrafigi } from './radar-grafigi';
import { GunHedefi, SeriKarti } from './seri-karti';

const gunler = (): MotivasyonSeriDetayi['gunler'] =>
  Array.from({ length: 35 }, (_, i) => {
    const gun = new Date(Date.UTC(2026, 9, 9 + i)).toISOString().slice(0, 10);
    const durum =
      i === 34
        ? 'yok'
        : i === 33
          ? 'onarim'
          : i === 30
            ? 'dondurma'
            : i === 20
              ? 'duraklatma'
              : i === 10
                ? 'kacirildi'
                : i < 5
                  ? 'yok'
                  : 'aktif';
    return { gun, durum, bugun: i === 34 };
  });

const seri = (ek: Partial<MotivasyonSeriDetayi> = {}): MotivasyonSeriDetayi => ({
  bugun: '2026-11-12',
  mevcut_seri: 15,
  en_uzun_seri: 23,
  dondurma_stogu: 1,
  onarim_hakki: 1,
  bugun_aktif: false,
  hedefler: [
    { tur: 'plan_gorevi', yapilan: 0, esik: 1, kalan: 1 },
    { tur: 'odak_dk', yapilan: 8, esik: 20, kalan: 12 },
    { tur: 'odev', yapilan: 0, esik: 1, kalan: 1 },
    { tur: 'soru', yapilan: 0, esik: 1, kalan: 1 },
  ],
  onarim: null,
  sonraki_kilometre_tasi: { hedef: 30, kalan: 15 },
  gunler: gunler(),
  ...ek,
});

describe('SeriKarti', () => {
  it('35 gunluk takvimi durumlariyla (metin alternatifli) cizer', () => {
    render(<SeriKarti seri={seri()} />);
    const takvim = screen.getByRole('list', { name: 'Son 35 günün takvimi' });
    const hucreler = within(takvim)
      .getAllByRole('listitem')
      .filter((li) => li.dataset.durum);
    expect(hucreler).toHaveLength(35);
    expect(hucreler.filter((h) => h.dataset.durum === 'aktif').length).toBeGreaterThan(20);
    // Her hucrede duruma ozgu metin alternatifi var.
    const dondurma = hucreler.find((h) => h.dataset.durum === 'dondurma');
    expect(dondurma).toHaveAttribute('aria-label', expect.stringContaining('Dondurma kullanıldı'));
    const duraklatma = hucreler.find((h) => h.dataset.durum === 'duraklatma');
    expect(duraklatma).toHaveAttribute('aria-label', expect.stringContaining('Öğretmenin arası'));
    const onarim = hucreler.find((h) => h.dataset.durum === 'onarim');
    expect(onarim).toHaveAttribute('aria-label', expect.stringContaining('Kurtarıldı'));
    expect(hucreler.at(-1)).toHaveAttribute('data-bugun', 'true');
  });

  it('suclayici dil yok: "kacirdin" hicbir yerde gecmez', () => {
    const { container } = render(<SeriKarti seri={seri({ mevcut_seri: 0 })} />);
    expect(container.textContent.toLocaleLowerCase('tr')).not.toMatch(/kaçırd/);
    expect(screen.getByTestId('seri-mesaji')).toHaveTextContent(
      'Rekorun 23 gün. Yeni seri bugün başlıyor.',
    );
  });

  it('onarim penceresi aciksa "Seriyi kurtarmak icin bugun ..." gosterir', () => {
    render(
      <SeriKarti
        seri={seri({
          mevcut_seri: 0,
          onarim: {
            bozulan_gun: '2026-11-11',
            bozulan_seri: 15,
            bitis_at: '2026-11-13T01:00:00.000Z',
            hedefler: [{ tur: 'odak_dk', yapilan: 0, esik: 40, kalan: 40 }],
          },
        })}
      />,
    );
    expect(screen.getByTestId('seri-onarim')).toHaveTextContent(
      'Seriyi kurtarmak için bugün 40 dk odaklan',
    );
  });

  it('onarim yoksa kurtarma metni gosterilmez', () => {
    render(<SeriKarti seri={seri()} />);
    expect(screen.queryByTestId('seri-onarim')).not.toBeInTheDocument();
  });
});

describe('GunHedefi', () => {
  it('her hedef icin ilerleme cubugu ve kalan miktar gosterir', () => {
    render(<GunHedefi seri={seri()} />);
    const odak = screen.getByRole('progressbar', { name: 'Odak' });
    expect(odak).toHaveAttribute('aria-valuenow', '8');
    expect(odak).toHaveAttribute('aria-valuemax', '20');
    expect(screen.getByText(/8 \/ 20 dk/)).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(4);
  });

  it('gun tamamsa tebrik metni cikar', () => {
    render(<GunHedefi seri={seri({ bugun_aktif: true })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Bugünkü hedefini tamamladın');
  });
});

describe('RadarGrafigi', () => {
  const beceriler = [
    { kod: 'sayisal', ad: 'Sayısal', puan: 420 },
    { kod: 'sozel', ad: 'Sözel', puan: 260 },
    { kod: 'fen', ad: 'Fen', puan: 310 },
    { kod: 'sosyal', ad: 'Sosyal', puan: 90 },
    { kod: 'dil', ad: 'Dil', puan: 150 },
  ];

  it('gorsel gizli, ayni veri okunabilir listede (metin alternatifi)', () => {
    render(<RadarGrafigi beceriler={beceriler} />);
    expect(screen.getByTestId('radar')).toHaveAttribute('aria-hidden', 'true');
    const liste = screen.getByTestId('radar-liste');
    for (const b of beceriler) {
      const satir = within(liste).getByText(b.ad).closest('li');
      expect(satir).toHaveTextContent(String(b.puan));
    }
    expect(screen.getByText('Beceri radarı. Değerler aşağıdaki listededir.')).toBeInTheDocument();
  });
});

describe('Ilerleme', () => {
  it('progressbar degerleri ve metni verir; ust sinirdan tasmaz', () => {
    render(<Ilerleme deger={30} ust={20} etiket="Odak" metin="20 / 20 dk" />);
    const bar = screen.getByRole('progressbar', { name: 'Odak' });
    expect(bar).toHaveAttribute('aria-valuenow', '20');
    expect(bar).toHaveAttribute('aria-valuetext', '20 / 20');
    expect(screen.getByText('20 / 20 dk')).toBeInTheDocument();
  });
});
