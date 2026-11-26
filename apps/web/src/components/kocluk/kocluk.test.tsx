import type { Degerlendirme } from '@kopru/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DegerlendirmeFormu } from './degerlendirme-formu';
import { OlcekEgilimi } from './olcek-egilimi';
import { ZamanCizelgesi } from './zaman-cizelgesi';

import { KurumKutusu, type KurumBaglami } from '@/kurum/baglam';
import { bugunYerel } from '@/lib/saat';

const OGRENCI = '0199aaaa-0000-7000-8000-000000000001';
const YAZAR = '0199aaaa-0000-7000-8000-000000000002';

afterEach(() => {
  vi.unstubAllGlobals();
});

function sarmala(ui: ReactNode, rol: KurumBaglami['rol'] = 'ogretmen') {
  const baglam: KurumBaglami = {
    uyelik: { id: 'u1', kurumId: 'kurum-x', kurumAd: 'K', rol, vurguRengi: null },
    rol,
    kullaniciAd: 'Ben Hoca',
    acikModuller: [],
  };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <KurumKutusu value={baglam}>{ui}</KurumKutusu>
    </QueryClientProvider>,
  );
}

const deg = (ek: Partial<Degerlendirme> = {}): Degerlendirme => ({
  id: '0199aaaa-0000-7000-8000-0000000000a1',
  ogrenci_id: OGRENCI,
  yazar_id: YAZAR,
  yazar_ad: 'Burcu Tekin',
  donem_baslangic: '2026-11-23',
  donem_bitis: '2026-11-29',
  brans_kodu: null,
  calisma_duzeni: 4,
  derse_katilim: null,
  odev_disiplini: null,
  anlama_duzeyi: null,
  yorum: 'Düzenli çalışıyor.',
  ogrenci_gorur: false,
  geri_cekildi_at: null,
  benim: false,
  duzenlenebilir: false,
  duzenleme_son_at: '2026-12-01T10:00:00.000Z',
  surum: 1,
  created_at: '2026-11-24T10:00:00.000Z',
  ...ek,
});

function fetchTaklidi(yanit: unknown, durum = 201) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(yanit), {
      status: durum,
      headers: { 'content-type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('DegerlendirmeFormu', () => {
  it('bu hafta on secili, ogrenci gorsun kapali ve anlami yazili; bos kayit reddedilir', async () => {
    const kullanici = userEvent.setup();
    const fetchMock = fetchTaklidi({});
    const bitti = vi.fn();
    sarmala(
      <DegerlendirmeFormu
        acik
        degisti={vi.fn()}
        ogrenciId={OGRENCI}
        ogrenciAd="Çağlar Yıldız"
        bitti={bitti}
      />,
    );
    const pencere = screen.getByRole('dialog', { name: 'Değerlendirme yaz' });
    expect(within(pencere).getByRole('radio', { name: /^Bu hafta/ })).toBeChecked();
    const anahtar = within(pencere).getByRole('switch', { name: 'Öğrenci görsün' });
    expect(anahtar).not.toBeChecked();
    expect(
      within(pencere).getByText(/yalnızca öğrencinin öğretmenleri ve kurum yöneticileri/),
    ).toBeInTheDocument();
    await kullanici.click(anahtar);
    expect(
      within(pencere).getByText(/öğrenci bu yorumu "Soru takibim" sayfasında okur/),
    ).toBeInTheDocument();

    await kullanici.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect(within(pencere).getByText('Yorum yaz ya da en az bir ölçek seç.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('olcek ve yorumla gonderir: hafta donemi, gorunurluk varsayilan kapali', async () => {
    const kullanici = userEvent.setup();
    const fetchMock = fetchTaklidi(deg({ benim: true }));
    const bitti = vi.fn();
    sarmala(
      <DegerlendirmeFormu
        acik
        degisti={vi.fn()}
        ogrenciId={OGRENCI}
        ogrenciAd="Çağlar Yıldız"
        bitti={bitti}
      />,
    );
    await kullanici.click(screen.getByRole('radio', { name: 'Çalışma düzeni: 4' }));
    await kullanici.click(screen.getByRole('radio', { name: 'Ödev disiplini: 2' }));
    await kullanici.type(screen.getByRole('textbox', { name: 'Yorum' }), 'Gayet iyi');
    await kullanici.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => {
      expect(bitti).toHaveBeenCalledWith('Değerlendirme kaydedildi.');
    });
    const [adres, secenek] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(adres).toContain(`/api/ogrenme/kurumlar/kurum-x/ogrenciler/${OGRENCI}/degerlendirmeler`);
    const govde = JSON.parse(secenek.body) as Record<string, unknown>;
    expect(govde).toMatchObject({
      calisma_duzeni: 4,
      odev_disiplini: 2,
      yorum: 'Gayet iyi',
      ogrenci_gorur: false,
    });
    expect(govde).not.toHaveProperty('derse_katilim');
    const bugun = bugunYerel('Europe/Istanbul');
    expect(String(govde.donem_baslangic) <= bugun).toBe(true);
    expect(String(govde.donem_bitis) > String(govde.donem_baslangic)).toBe(true);
  });

  it('409 hata kodu Turkce mesaja cevrilir', async () => {
    const kullanici = userEvent.setup();
    fetchTaklidi({ error: { code: 'degerlendirme_duzenlenemez', message: 'x' } }, 409);
    sarmala(
      <DegerlendirmeFormu
        acik
        degisti={vi.fn()}
        ogrenciId={OGRENCI}
        ogrenciAd="Çağlar Yıldız"
        duzelt={deg({ benim: true, duzenlenebilir: true })}
        bitti={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Değerlendirmeyi düzenle' })).toBeInTheDocument();
    await kullanici.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Değerlendirme yalnızca yazıldıktan sonraki 7 gün içinde düzenlenebilir.',
    );
  });
});

describe('ZamanCizelgesi', () => {
  it('yazar, gorunurluk isareti, duzenle/geri cek yetkisi ve devam sayfasi', async () => {
    const kullanici = userEvent.setup();
    const devam = deg({
      id: '0199aaaa-0000-7000-8000-0000000000a9',
      yazar_ad: 'Eski Hoca',
      yorum: 'Devam sayfasındaki yorum',
    });
    const fetchMock = fetchTaklidi({ degerlendirmeler: [devam], sonraki_imlec: null }, 200);
    sarmala(
      <ZamanCizelgesi
        ogrenciId={OGRENCI}
        ogrenciAd="Çağlar Yıldız"
        yanitZamani={1}
        bildir={vi.fn()}
        ilk={{
          degerlendirmeler: [
            deg({ benim: true, duzenlenebilir: true, ogrenci_gorur: true, yazar_ad: 'Ben Hoca' }),
            deg({ id: '0199aaaa-0000-7000-8000-0000000000a2', yazar_ad: 'Başka Hoca' }),
          ],
          sonraki_imlec: 'imlec-1',
        }}
      />,
    );
    const [benimki, baskasi] = screen.getAllByTestId('degerlendirme-satiri') as [
      HTMLElement,
      HTMLElement,
    ];
    expect(within(benimki).getByText('Ben Hoca (sen)')).toBeInTheDocument();
    expect(within(benimki).getByText('Öğrenci görüyor')).toBeInTheDocument();
    expect(within(benimki).getByRole('button', { name: /Düzenle/ })).toBeInTheDocument();
    expect(within(benimki).getByRole('button', { name: /Geri çek/ })).toBeInTheDocument();
    // Baska ogretmenin kaydi: ogretmen duzenleyemez ve geri cekemez.
    expect(within(baskasi).getByText('Öğrenciye kapalı')).toBeInTheDocument();
    expect(within(baskasi).queryByRole('button')).toBeNull();

    await kullanici.click(screen.getByRole('button', { name: 'Daha fazla göster' }));
    expect(await screen.findByText('Devam sayfasındaki yorum')).toBeInTheDocument();
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('imlec=imlec-1');
    expect(screen.queryByRole('button', { name: 'Daha fazla göster' })).toBeNull();
  });

  it('yonetici baska ogretmenin kaydini geri cekebilir', () => {
    sarmala(
      <ZamanCizelgesi
        ogrenciId={OGRENCI}
        ogrenciAd="Çağlar Yıldız"
        yanitZamani={1}
        bildir={vi.fn()}
        ilk={{ degerlendirmeler: [deg()], sonraki_imlec: null }}
      />,
      'yonetici',
    );
    expect(screen.getByRole('button', { name: /Geri çek/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Düzenle/ })).toBeNull();
  });

  it('bos liste bos durum gosterir', () => {
    sarmala(
      <ZamanCizelgesi
        ogrenciId={OGRENCI}
        ogrenciAd="Çağlar Yıldız"
        yanitZamani={1}
        bildir={vi.fn()}
        ilk={{ degerlendirmeler: [], sonraki_imlec: null }}
      />,
    );
    expect(screen.getByText('Henüz değerlendirme yok')).toBeInTheDocument();
  });
});

describe('OlcekEgilimi', () => {
  const bos = {
    sayi: 0,
    calisma_duzeni: null,
    derse_katilim: null,
    odev_disiplini: null,
    anlama_duzeyi: null,
  };

  it('veri yoksa bos mesaj', () => {
    render(
      <OlcekEgilimi
        egilim={{
          haftalar: [{ hafta_baslangic: '2026-11-02', ...bos }],
          toplam: bos,
        }}
      />,
    );
    expect(screen.getByText('Son 4 haftada ölçek verisi yok.')).toBeInTheDocument();
  });

  it('tablo: hafta satirlari ve ortalama, eksik deger "Yok" olarak okunur', () => {
    render(
      <OlcekEgilimi
        egilim={{
          haftalar: [
            { hafta_baslangic: '2026-11-02', ...bos },
            {
              hafta_baslangic: '2026-11-09',
              sayi: 2,
              calisma_duzeni: 3.5,
              derse_katilim: null,
              odev_disiplini: 4,
              anlama_duzeyi: 2,
            },
          ],
          toplam: {
            sayi: 2,
            calisma_duzeni: 3.5,
            derse_katilim: null,
            odev_disiplini: 4,
            anlama_duzeyi: 2,
          },
        }}
      />,
    );
    const tablo = screen.getByRole('table', { name: 'Son 4 haftanın ölçek ortalamaları (1-5)' });
    expect(within(tablo).getAllByRole('row')).toHaveLength(4);
    expect(within(tablo).getAllByText('3,5')).toHaveLength(2);
    expect(within(tablo).getAllByText('Yok').length).toBeGreaterThan(0);
  });
});
