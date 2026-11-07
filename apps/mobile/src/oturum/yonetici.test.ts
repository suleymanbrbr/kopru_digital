import { mockAdaptorler } from '../api/mock';
import { ApiHata } from '../api/tipler';
import { bellekBelirtecDeposu } from '../depo/belirtecDeposu';
import { oturumYoneticisiOlustur } from './yonetici';

function kur() {
  const depo = bellekBelirtecDeposu();
  const adaptorler = mockAdaptorler(depo, 0);
  const temizle = jest.fn();
  const y = oturumYoneticisiOlustur({ adaptorler, temizle });
  return { y, adaptorler, depo, temizle };
}

describe('oturum yoneticisi', () => {
  it('kayitli oturum yoksa cikis durumuna gecer', async () => {
    const { y } = kur();
    await y.baslat();
    expect(y.depo.al().asama).toBe('cikis');
  });

  it('giris -> kvkk -> kurum secimi akisi; veli uyeligi elenir', async () => {
    const { y, adaptorler } = kur();
    await adaptorler.auth.otpDogrula('+905551110005', '123456');
    await y.girisTamamlandi();
    let d = y.depo.al();
    if (d.asama !== 'giris') throw new Error('giris bekleniyordu');
    expect(d.kvkk.kabulEdilenSurum).toBeNull();
    expect(d.uyelikler.map((u) => u.rol)).toEqual(['ogretmen', 'ogrenci']);

    await y.kvkkKabulEt();
    d = y.depo.al();
    if (d.asama !== 'giris') throw new Error();
    expect(d.kvkk.kabulEdilenSurum).toBe(d.kvkk.guncelSurum);

    await y.uyelikSec('uyelik-ogrenci-b');
    d = y.depo.al();
    if (d.asama !== 'giris') throw new Error();
    expect(d.aktif?.uyelik.rol).toBe('ogrenci');
    expect(d.aktif?.vurgu).toBe('#0F9D8A');
    expect(d.aktif?.moduller.soru_sor).toBe(false);
  });

  it('riza_gerekli hatasi KVKK onayini sifirlar, yetkisiz oturumu kapatir', async () => {
    const { y, adaptorler } = kur();
    await adaptorler.auth.otpDogrula('+905551110001', '123456');
    await y.girisTamamlandi();
    await y.kvkkKabulEt();
    y.hataIsle(new ApiHata('riza_gerekli', undefined, { durum: 403 }));
    const d = y.depo.al();
    if (d.asama !== 'giris') throw new Error();
    expect(d.kvkk.kabulEdilenSurum).toBeNull();
    y.hataIsle(new ApiHata('yetkisiz', undefined, { durum: 401 }));
    expect(y.depo.al().asama).toBe('cikis');
  });

  it('cikis belirtecleri siler ve onbellegi temizler', async () => {
    const { y, adaptorler, depo, temizle } = kur();
    await adaptorler.auth.otpDogrula('+905551110001', '123456');
    await y.girisTamamlandi();
    await y.cikis();
    expect(await depo.oku()).toBeNull();
    expect(temizle).toHaveBeenCalled();
    expect(y.depo.al().asama).toBe('cikis');
  });

  it('yanlis OTP otp_gecersiz firlatir', async () => {
    const { adaptorler } = kur();
    await expect(adaptorler.auth.otpDogrula('+905551110001', '000000')).rejects.toMatchObject({
      kod: 'otp_gecersiz',
    });
  });
});
