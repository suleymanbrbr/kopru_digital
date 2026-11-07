import { KimlikHatasi, type KimlikAdaptoru, type OturumSecimi, type OturumSonucu } from './arayuz';

import type { KurumBaglami, Oturum, RizaMetni, Uyelik } from '@/oturum/tipler';

/** Deneme ortaminda her telefon icin gecerli olan kod. */
export const MOCK_KOD = '123456';
export const MOCK_RIZA_SURUMU = '2026-11';

const tumModuller = ['ders', 'odev', 'plan', 'deneme', 'soru', 'kayit', 'finans', 'motivasyon'];

/** Deneme kurumlari: her biri farkli rol, vurgu rengi ve modul kumesi gosterir. */
const kurumlar: Record<string, { uyelik: Uyelik; moduller: string[] }> = {
  'kurum-ege': {
    uyelik: {
      id: 'uyelik-ege-ogretmen',
      kurumId: 'kurum-ege',
      kurumAd: 'Ege Işık Dershanesi',
      rol: 'ogretmen',
      vurguRengi: null,
    },
    moduller: tumModuller,
  },
  'kurum-mavi': {
    uyelik: {
      id: 'uyelik-mavi-yonetici',
      kurumId: 'kurum-mavi',
      kurumAd: 'Mavi Kule Kurs Merkezi',
      rol: 'yonetici',
      vurguRengi: '#0E9F8E',
    },
    moduller: tumModuller.filter((m) => m !== 'finans' && m !== 'deneme'),
  },
  'kurum-atlas': {
    uyelik: {
      id: 'uyelik-atlas-ogrenci',
      kurumId: 'kurum-atlas',
      kurumAd: 'Atlas Etüt Merkezi',
      rol: 'ogrenci',
      vurguRengi: null,
    },
    moduller: tumModuller.filter((m) => m !== 'finans'),
  },
  'kurum-kuzey': {
    uyelik: {
      id: 'uyelik-kuzey-sahip',
      kurumId: 'kurum-kuzey',
      kurumAd: 'Kuzey Yıldızı Akademi',
      rol: 'sahip',
      vurguRengi: '#7C5CE0',
    },
    moduller: tumModuller,
  },
};

const uyelikler = Object.values(kurumlar).map((k) => k.uyelik);

const kullanici = { id: 'kullanici-demo', ad: 'Elif Yılmaz', telefon: '+905321234567' };

/** Mock oturum belirteci: opak gorunur ama imzasizdir; yalnizca deneme ortami icindir. */
interface BelirtecIcerigi {
  /** Kabul edilen riza surumu. */
  r: string | null;
  /** Etkin uyelik kimligi. */
  a: string | null;
}

function belirtecYaz(icerik: BelirtecIcerigi): string {
  return `mock.${Buffer.from(JSON.stringify(icerik)).toString('base64url')}`;
}

function belirtecOku(belirtec: string): BelirtecIcerigi {
  if (!belirtec.startsWith('mock.')) throw new KimlikHatasi(401, 'yetkisiz', 'Oturum geçersiz.');
  try {
    const cozulen = JSON.parse(
      Buffer.from(belirtec.slice(5), 'base64url').toString('utf8'),
    ) as Partial<BelirtecIcerigi>;
    return { r: cozulen.r ?? null, a: cozulen.a ?? null };
  } catch {
    throw new KimlikHatasi(401, 'yetkisiz', 'Oturum geçersiz.');
  }
}

const rizaMetni: RizaMetni = {
  surum: MOCK_RIZA_SURUMU,
  baslik: 'Kişisel verilerin işlenmesine ilişkin aydınlatma metni',
  bolumler: [
    {
      baslik: 'Veri sorumlusu',
      metin:
        'Bu uygulamayı kullandığın kurum, 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında veri sorumlusudur. Köprü, kurumun talimatıyla veri işleyen olarak hizmet verir.',
    },
    {
      baslik: 'İşlenen kişisel veriler',
      metin:
        'Ad soyad, telefon numarası, kurum içindeki rolün, derslere katılım ve yoklama bilgilerin, ödev ve deneme sonuçların, kurumla yaptığın ödeme kayıtların ve uygulama kullanım bilgilerin işlenir.',
    },
    {
      baslik: 'İşleme amaçları',
      metin:
        'Verilerin; ders programının yürütülmesi, öğrenme sürecinin takibi, kurumla iletişim, ödeme ve muhasebe işlemleri ile yasal yükümlülüklerin yerine getirilmesi amacıyla işlenir.',
    },
    {
      baslik: 'Aktarım',
      metin:
        'Verilerin yalnızca kurumun yetkili personeline, hizmet aldığımız altyapı sağlayıcılarına ve yasal olarak yetkili kamu kurumlarına, gereken en dar kapsamda aktarılır.',
    },
    {
      baslik: 'Saklama süresi',
      metin:
        'Verilerin, ilişkin olduğu amaç için gerekli süre boyunca ve yasal saklama sürelerince tutulur; süre dolunca silinir ya da anonim hale getirilir.',
    },
    {
      baslik: 'Hakların',
      metin:
        'Kanunun 11. maddesi uyarınca verilerinin işlenip işlenmediğini öğrenme, düzeltilmesini ve silinmesini isteme haklarına sahipsin. Başvurularını kurumunun yetkili kişisine iletebilirsin.',
    },
  ],
};

function oturumKur(icerik: BelirtecIcerigi): Oturum {
  return {
    erisimBelirteci: `mock-erisim.${Math.random().toString(36).slice(2, 10)}`,
    bitisAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    kullanici,
    uyelikler,
    aktifUyelikId: icerik.a,
    rizaGerekli: icerik.r !== MOCK_RIZA_SURUMU,
  };
}

/** Esenkron hata semantigi: senkron firlatmalar reddedilmis Promise'a donusur. */
function dene<T>(is: () => T): Promise<T> {
  return new Promise((coz, reddet) => {
    try {
      coz(is());
    } catch (hata) {
      reddet(hata instanceof Error ? hata : new Error(String(hata)));
    }
  });
}

export function mockKimlik(): KimlikAdaptoru {
  return {
    kodIste(telefon) {
      if (!/^\+905\d{9}$/.test(telefon)) {
        return Promise.reject(
          new KimlikHatasi(400, 'telefon_gecersiz', 'Telefon numarası geçersiz.'),
        );
      }
      return Promise.resolve({ yenidenSn: 30 });
    },

    kodDogrula(_telefon, kod) {
      if (kod !== MOCK_KOD) {
        return Promise.reject(new KimlikHatasi(400, 'otp_gecersiz', 'Kod hatalı.'));
      }
      return Promise.resolve({ oturumBelirteci: belirtecYaz({ r: null, a: null }) });
    },

    oturumAl(oturumBelirteci, secim?: OturumSecimi): Promise<OturumSonucu> {
      return dene(() => oturumAlSenkron(oturumBelirteci, secim));
    },

    kurumBaglami(oturumBelirteci, _erisim, kurumId): Promise<KurumBaglami> {
      return dene(() => {
        belirtecOku(oturumBelirteci);
        const kurum = kurumlar[kurumId];
        if (!kurum) throw new KimlikHatasi(404, 'bulunamadi', 'Kurum bulunamadı.');
        return { kurumId, moduller: kurum.moduller };
      });
    },

    rizaMetni(oturumBelirteci) {
      return dene(() => {
        belirtecOku(oturumBelirteci);
        return rizaMetni;
      });
    },

    rizaKabul(oturumBelirteci, surum) {
      return dene(() => {
        const icerik = belirtecOku(oturumBelirteci);
        if (surum !== MOCK_RIZA_SURUMU) {
          throw new KimlikHatasi(409, 'cakisma', 'Metin sürümü güncel değil.');
        }
        return { oturumBelirteci: belirtecYaz({ ...icerik, r: surum }) };
      });
    },

    cikis() {
      return Promise.resolve();
    },
  };
}

function oturumAlSenkron(oturumBelirteci: string, secim?: OturumSecimi): OturumSonucu {
  const icerik = belirtecOku(oturumBelirteci);
  const secilen = secim?.uyelikId
    ? uyelikler.find((u) => u.id === secim.uyelikId)
    : secim?.kurumId
      ? uyelikler.find((u) => u.kurumId === secim.kurumId)
      : undefined;
  if ((secim?.uyelikId ?? secim?.kurumId) && !secilen) {
    throw new KimlikHatasi(403, 'yasak', 'Bu kurumda üyeliğin yok.');
  }
  const yeni: BelirtecIcerigi = secilen ? { ...icerik, a: secilen.id } : icerik;
  return {
    oturum: oturumKur(yeni),
    ...(secilen ? { oturumBelirteci: belirtecYaz(yeni) } : {}),
  };
}
