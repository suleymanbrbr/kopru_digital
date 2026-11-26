import { veriyiPaylas } from './veriDisaAktar';

const dosya = {
  dosyaAdi: 'kopru-verilerim-2026-11-08.json',
  icerik: '{"a":1}',
  eksikServisler: [],
};

describe('veriyiPaylas', () => {
  it('iOS: gecici dosyaya yazar, dosyayi paylasir, sonra siler', async () => {
    const olaylar: string[] = [];
    await veriyiPaylas(dosya, 'Basl', {
      platform: 'ios',
      yaz: (ad, icerik) => {
        olaylar.push(`yaz:${ad}:${icerik}`);
        return Promise.resolve('file:///tmp/x.json');
      },
      paylas: (s) => {
        olaylar.push(`paylas:${'url' in s ? s.url : 'metin'}`);
        return Promise.resolve();
      },
      sil: (uri) => {
        olaylar.push(`sil:${uri}`);
        return Promise.resolve();
      },
    });
    expect(olaylar).toEqual([
      `yaz:${dosya.dosyaAdi}:${dosya.icerik}`,
      'paylas:file:///tmp/x.json',
      'sil:file:///tmp/x.json',
    ]);
  });

  it('iOS: paylasim hata verse de dosya silinir', async () => {
    const sil = jest.fn(() => Promise.resolve());
    await expect(
      veriyiPaylas(dosya, 'B', {
        platform: 'ios',
        yaz: () => Promise.resolve('file:///tmp/y.json'),
        paylas: () => Promise.reject(new Error('x')),
        sil,
      }),
    ).rejects.toThrow('x');
    expect(sil).toHaveBeenCalledWith('file:///tmp/y.json');
  });

  it('Android: dosya yazmadan JSON metnini paylasir', async () => {
    const yaz = jest.fn(() => Promise.resolve('x'));
    const paylas = jest.fn(() => Promise.resolve());
    await veriyiPaylas(dosya, 'B', { platform: 'android', yaz, paylas });
    expect(yaz).not.toHaveBeenCalled();
    expect(paylas).toHaveBeenCalledWith({ message: dosya.icerik, title: 'B' });
  });
});
