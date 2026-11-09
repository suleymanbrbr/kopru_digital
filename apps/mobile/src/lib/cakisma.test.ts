import { ApiHata } from '../api/tipler';
import { cakisanDersleriOku } from './cakisma';

describe('cakisanDersleriOku', () => {
  it('ders_cakismasi detayindan cakisan dersleri camelCase okur', () => {
    const e = new ApiHata('cakisma', 'x', {
      durum: 409,
      ayrinti: 'ders_cakismasi',
      detay: {
        cakisanlar: [
          {
            id: 'd1',
            grup_id: 'g1',
            baslik: 'Üslü sayılar',
            baslangic_at: '2026-11-09T08:00:00.000Z',
            bitis_at: '2026-11-09T09:00:00.000Z',
          },
        ],
      },
    });
    expect(cakisanDersleriOku(e)).toEqual([
      {
        id: 'd1',
        grupId: 'g1',
        baslik: 'Üslü sayılar',
        baslangic: '2026-11-09T08:00:00.000Z',
        bitis: '2026-11-09T09:00:00.000Z',
      },
    ]);
  });

  it('baska hatalar icin null, detay yoksa bos liste', () => {
    expect(
      cakisanDersleriOku(new ApiHata('cakisma', 'x', { ayrinti: 'kapasite_dolu' })),
    ).toBeNull();
    expect(cakisanDersleriOku(new Error('x'))).toBeNull();
    expect(cakisanDersleriOku(new ApiHata('cakisma', 'x', { ayrinti: 'ders_cakismasi' }))).toEqual(
      [],
    );
  });
});
