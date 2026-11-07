import type { BelirtecDeposu } from '../depo/belirtecDeposu';
import type { Adaptorler } from './adaptorler';
import {
  ApiHata,
  type MobilRol,
  type OturumBilgisi,
  type Rol,
  type Uyelik,
  type UyelikBaglami,
} from './tipler';

const KVKK_SURUMU = '2026-01';
export const MOCK_OTP = '123456';

const kurumlar = {
  a: { id: 'kurum-a', ad: 'Köprü Dershanesi', vurgu: null },
  b: { id: 'kurum-b', ad: 'Atlas Fen Lisesi Kursu', vurgu: '#0F9D8A' },
};

/** Telefonun son hanesine gore rol: 1 ogretmen, 2 ogrenci, 3 yonetici, 4 sahip, 5 cok kurumlu. */
function uyelikleriUret(telefon: string): Uyelik[] {
  const u = (rol: Rol, k: keyof typeof kurumlar): Uyelik => ({
    uyelikId: `uyelik-${rol}-${k}`,
    kurumId: kurumlar[k].id,
    kurumAd: kurumlar[k].ad,
    rol,
  });
  switch (telefon.slice(-1)) {
    case '2':
      return [u('ogrenci', 'a')];
    case '3':
      return [u('yonetici', 'a')];
    case '4':
      return [u('sahip', 'a'), u('ogretmen', 'a')];
    case '5':
      return [u('ogretmen', 'a'), u('ogrenci', 'b'), u('veli', 'b')];
    default:
      return [u('ogretmen', 'a')];
  }
}

const bekle = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function moduller(rol: MobilRol | Rol, kurum: 'a' | 'b') {
  // b kurumunda "soru sor" kapali: sekme gizlenmesini gostermek icin.
  return {
    takvim: true,
    yoklama: true,
    odev: true,
    soru_sor: kurum === 'a',
    oyunlastirma: rol === 'ogrenci',
    duyuru: true,
  };
}

/** Backend olmadan calisan sahte adaptorler (EXPO_PUBLIC_API_MOCK=1). */
export function mockAdaptorler(depo: BelirtecDeposu, gecikmeMs = 350): Adaptorler {
  let telefon: string | null = null;
  let kvkkSurum: string | null = null;

  async function oturumGerekli() {
    if (!(await depo.oku())) throw new ApiHata('yetkisiz', undefined, { durum: 401 });
  }

  return {
    auth: {
      async otpIste(tel) {
        await bekle(gecikmeMs);
        telefon = tel;
        return { yenidenGondermeSn: 30 };
      },
      async otpDogrula(tel, kod) {
        await bekle(gecikmeMs);
        if (kod !== MOCK_OTP) throw new ApiHata('otp_gecersiz', undefined, { durum: 400 });
        telefon = tel;
        await depo.yaz({
          erisim: `mock-erisim-${tel}`,
          yenileme: `mock-yenileme-${tel}`,
          erisimBitis: Date.now() + 15 * 60_000,
        });
      },
      async oturumBilgisi(): Promise<OturumBilgisi> {
        await bekle(gecikmeMs / 2);
        await oturumGerekli();
        const tel =
          telefon ?? (await depo.oku())?.erisim.replace('mock-erisim-', '') ?? '5550000001';
        telefon = tel;
        return {
          kullanici: { id: `kullanici-${tel}`, adSoyad: 'Deniz Yılmaz', telefon: tel },
          uyelikler: uyelikleriUret(tel),
          kvkk: { guncelSurum: KVKK_SURUMU, kabulEdilenSurum: kvkkSurum },
        };
      },
      async kvkkKabulEt(surum) {
        await bekle(gecikmeMs);
        await oturumGerekli();
        kvkkSurum = surum;
      },
      async uyelikSec(uyelikId): Promise<UyelikBaglami> {
        await bekle(gecikmeMs);
        await oturumGerekli();
        const uyelik = uyelikleriUret(telefon ?? '5550000001').find((x) => x.uyelikId === uyelikId);
        if (!uyelik) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
        const k = uyelik.kurumId === 'kurum-b' ? 'b' : 'a';
        return { uyelik, moduller: moduller(uyelik.rol, k), vurgu: kurumlar[k].vurgu };
      },
      async cikis() {
        await bekle(100);
        await depo.sil();
        telefon = null;
      },
    },
    veri: {
      async ogretmenBugun() {
        await bekle(gecikmeMs);
        await oturumGerekli();
        return { dersler: [], bekleyenSorular: [] };
      },
      async ogrenciBugun() {
        await bekle(gecikmeMs);
        await oturumGerekli();
        return {
          seri: 3,
          gorevler: [],
          karakter: {
            ad: 'Közü',
            tur: 'kivilcim',
            asama: 3,
            seviye: 12,
            varyant: 0,
            beceriler: { sayisal: 6, sozel: 3, fen: 8, sosyal: 2, dil: 4 },
            uykulu: false,
          },
        };
      },
    },
  };
}
