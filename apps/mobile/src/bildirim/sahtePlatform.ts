import type { Adaptorler } from '../api/adaptorler';
import { bellekKv } from '../depo/kv';
import type { OturumYoneticisi } from '../oturum/yonetici';
import type { BildirimYuku } from './baglanti';
import type { IzinDurumu, PushPlatformu } from './platform';
import { bildirimYoneticisiOlustur, type BildirimYoneticisi } from './yonetici';

/** Testler icin bellek ici push platformu: izin, belirtec ve olaylar elle surulur. */
export interface SahtePlatform extends PushPlatformu {
  izin: IzinDurumu;
  /** `izinIste` cagrisinda verilecek sonuc. */
  izinSonucu: IzinDurumu;
  belirtec: string | null;
  rozet: number | null;
  izinIstekSayisi: number;
  ayarlarAcildi: number;
  gelenGonder: (y: BildirimYuku) => void;
  dokunmaGonder: (y: BildirimYuku, kimlik?: string) => void;
  belirtecDegisti: () => void;
}

export function sahtePlatform(baslangic: Partial<SahtePlatform> = {}): SahtePlatform {
  const gelen = new Set<(y: BildirimYuku) => void>();
  const dokunma = new Set<(y: BildirimYuku, kimlik: string) => void>();
  const degisim = new Set<(b: string) => void>();
  let sayac = 0;
  const p: SahtePlatform = {
    os: 'ios',
    izin: 'verilmedi',
    izinSonucu: 'verildi',
    belirtec: 'ExponentPushToken[test-belirteci]',
    rozet: null,
    izinIstekSayisi: 0,
    ayarlarAcildi: 0,
    izinDurumu: () => Promise.resolve(p.izin),
    izinIste: () => {
      p.izinIstekSayisi++;
      p.izin = p.izinSonucu;
      return Promise.resolve(p.izin);
    },
    belirtecAl: () => Promise.resolve(p.belirtec),
    rozetAyarla: (n) => {
      p.rozet = n;
      return Promise.resolve();
    },
    gelenDinle: (cb) => {
      gelen.add(cb);
      return () => gelen.delete(cb);
    },
    dokunmaDinle: (cb) => {
      dokunma.add(cb);
      return () => dokunma.delete(cb);
    },
    belirtecDegisinceDinle: (cb) => {
      degisim.add(cb);
      return () => degisim.delete(cb);
    },
    ayarlariAc: () => {
      p.ayarlarAcildi++;
      return Promise.resolve();
    },
    gelenGonder: (y) => {
      gelen.forEach((f) => {
        f(y);
      });
    },
    dokunmaGonder: (y, kimlik = `test-${String(++sayac)}`) => {
      dokunma.forEach((f) => {
        f(y, kimlik);
      });
    },
    belirtecDegisti: () => {
      degisim.forEach((f) => {
        f(p.belirtec ?? '');
      });
    },
    ...baslangic,
  };
  return p;
}

/** Ekran testleri icin: sahte platformlu bildirim yoneticisi (bellek ici depo, sabit cihaz kimligi). */
export function testBildirimYoneticisi(
  adaptorler: Adaptorler,
  oturum: OturumYoneticisi,
  platform: SahtePlatform = sahtePlatform(),
  secenek: { degisti?: () => void } = {},
): { yonetici: BildirimYoneticisi; platform: SahtePlatform } {
  const yonetici = bildirimYoneticisiOlustur({
    platform,
    bildirim: () => adaptorler.bildirim,
    oturum,
    depo: bellekKv(),
    yeniId: () => '0190f3a0-0000-7000-8000-00000000c1d1',
    uygulamaSurumu: '0.1.0',
    ...secenek,
  });
  return { yonetici, platform };
}
