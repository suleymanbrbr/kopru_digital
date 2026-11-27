import type { EkListesi } from '@kopru/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EkDuzenleyici, EkListesiGorunumu } from './ek-bilesenleri';

const A = '0199aaaa-0000-7000-8000-0000000000a1';
const B = '0199aaaa-0000-7000-8000-0000000000b2';

afterEach(() => {
  vi.unstubAllGlobals();
});

const adres = (id: string) => ({
  dosya_id: id,
  mime_tipi: 'application/pdf',
  asil_url: `https://depo.test/${id}`,
  kucuk_url: null,
  orta_url: null,
  genislik: null,
  yukseklik: null,
  sure_sn: null,
  gecerlilik_bitis_at: '2030-01-01T00:00:00.000Z',
});

const liste = (idler: string[], alinamadi = false): EkListesi => ({
  ekler: idler.map((id, sira) => ({
    medya_dosya_id: id,
    sira,
    mime_tipi: sira === 0 ? 'application/pdf' : 'image/jpeg',
    boyut_bayt: sira === 0 ? 1_258_291 : 348_160,
    adres: alinamadi ? null : adres(id),
  })),
  adresler_alinamadi: alinamadi,
});

function sarmala(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

/** `GET` sunucudaki guncel listeyi, `PUT` verilen kimlik kumesini kalici yazar. */
function sunucuTaklidi(baslangic: string[]) {
  let kume = baslangic;
  const cagrilar: { yontem: string; govde: unknown }[] = [];
  const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
    const yontem = init?.method ?? 'GET';
    const govde = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    cagrilar.push({ yontem, govde });
    if (yontem === 'PUT') kume = (govde as { medya_dosya_idleri: string[] }).medya_dosya_idleri;
    return Promise.resolve(
      new Response(JSON.stringify(liste(kume)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, cagrilar };
}

describe('EkListesiGorunumu', () => {
  it('ekleri sirayla, tur ve boyutla gosterir; "Ac / indir" imzali adrese gider', async () => {
    sunucuTaklidi([A, B]);
    sarmala(<EkListesiGorunumu kurumId="k1" yol="ogrenci-odevleri/r1/ekler" />);
    expect(await screen.findByText('Ek 1')).toBeInTheDocument();
    expect(screen.getByText('Ek 2')).toBeInTheDocument();
    expect(screen.getByText(/PDF belgesi · 1,2 MB/)).toBeInTheDocument();
    expect(screen.getByText(/Fotoğraf · 340 KB/)).toBeInTheDocument();
    const baglanti = screen.getByRole('link', { name: 'Ek 1 dosyasını aç' });
    expect(baglanti).toHaveAttribute('href', `https://depo.test/${A}`);
    expect(baglanti).toHaveAttribute('target', '_blank');
    expect(baglanti).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('ek yoksa bos metin; adres alinamazsa "yeniden dene" gorunur', async () => {
    sunucuTaklidi([]);
    sarmala(<EkListesiGorunumu kurumId="k1" yol="odevler/o1/ekler" />);
    expect(await screen.findByText('Henüz ek yok.')).toBeInTheDocument();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(liste([A], true)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    sarmala(<EkListesiGorunumu kurumId="k2" yol="odevler/o2/ekler" />);
    expect(await screen.findByText('Dosya şu anda açılamıyor.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yeniden dene' })).toBeInTheDocument();
  });
});

describe('EkDuzenleyici', () => {
  it('ek kaldirilinca guncel liste okunur ve kalan kume PUT ile yazilir', async () => {
    const kullanici = userEvent.setup();
    const { cagrilar } = sunucuTaklidi([A, B]);
    sarmala(
      <EkDuzenleyici kurumId="k1" yol="odevler/o1" tur="odev_eki" aciklama="Açıklama metni" />,
    );
    expect(await screen.findByText('Ek 2')).toBeInTheDocument();
    await kullanici.click(screen.getByRole('button', { name: 'Ek 1 dosyasını kaldır' }));
    await waitFor(() => {
      expect(cagrilar.some((c) => c.yontem === 'PUT')).toBe(true);
    });
    expect(cagrilar.find((c) => c.yontem === 'PUT')?.govde).toEqual({ medya_dosya_idleri: [B] });
    expect(await screen.findByText('Ekler güncellendi.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Ek 2')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Ek 1')).toBeInTheDocument(); // kalan dosya yeniden numaralandi
  });

  it('salt okunur modda kaldirma ve dosya secici yok, neden gorunur', async () => {
    sunucuTaklidi([A]);
    sarmala(
      <EkDuzenleyici
        kurumId="k1"
        yol="planlar/p1"
        tur="plan_eki"
        aciklama="Açıklama"
        salt
        saltNedeni="Bu hafta kilitli; ekler değiştirilemez."
      />,
    );
    expect(await screen.findByText('Ek 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /kaldır/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dosya ekle' })).not.toBeInTheDocument();
    expect(screen.getByText('Bu hafta kilitli; ekler değiştirilemez.')).toBeInTheDocument();
  });

  it('PDF/resim disi dosya yuklemeden reddedilir ve sunucuya gitmez', async () => {
    const kullanici = userEvent.setup({ applyAccept: false });
    const { cagrilar } = sunucuTaklidi([]);
    sarmala(<EkDuzenleyici kurumId="k1" yol="odevler/o1" tur="odev_eki" aciklama="Açıklama" />);
    await screen.findByText('Henüz ek yok.');
    const girdi = screen.getByTestId('ek-girdisi');
    await kullanici.upload(girdi, new File(['x'], 'sunum.zip', { type: 'application/zip' }));
    expect(
      await screen.findByText('sunum.zip: yalnızca PDF, JPEG, PNG ve WebP eklenebilir.'),
    ).toBeInTheDocument();
    expect(cagrilar.every((c) => c.yontem === 'GET')).toBe(true);
    expect(screen.queryByTestId('ek-yukleme-ogesi')).not.toBeInTheDocument();
  });
});
