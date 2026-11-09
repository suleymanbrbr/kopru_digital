import { ApiHata } from '../api/tipler';
import { hataMesaji, kuyrukHataMesaji } from './hatalar';

describe('ders, yoklama ve finans hata mesajlari', () => {
  it.each([
    ['ders_henuz_baslamadi', 422, 'dogrulama', 'henüz başlamadı'],
    ['yoklama_kilitli', 403, 'izin_yok', 'kilitlendi'],
    ['ogrenci_katilimci_degil', 422, 'dogrulama', 'katılımcısı değil'],
    ['ogrenci_modeli_paket_degil', 409, 'cakisma', 'finans modelini paket'],
    ['surum_cakismasi', 409, 'cakisma', 'değişti'],
  ] as const)('%s anlasilir Turkce mesaja doner', (ayrinti, durum, kod, parca) => {
    const mesaj = hataMesaji(new ApiHata(kod, 'x', { durum, ayrinti }));
    expect(mesaj).toContain(parca);
  });

  it('kuyruk hata kodlari: yoklama_eski ve bilinmeyen', () => {
    expect(kuyrukHataMesaji('yoklama_eski')).toContain('daha yeni');
    expect(kuyrukHataMesaji('yoklama_kilitli')).toContain('kilitlendi');
    expect(kuyrukHataMesaji(undefined)).toContain('ters gitti');
  });

  it('mevcut sinif akislari etkilenmez', () => {
    expect(hataMesaji(new ApiHata('cakisma', 'x', { ayrinti: 'kapasite_dolu' }))).toContain(
      'kapasitesi',
    );
  });
});
