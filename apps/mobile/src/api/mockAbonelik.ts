import type {
  Abonelik,
  AbonelikAdapter,
  AbonelikKaynagi,
  AbonelikOzeti,
  AbonelikPlani,
  PlatformMesaji,
} from './abonelikTipleri';
import type { MockOperasyonSecenekleri } from './mockOperasyon';
import { ApiHata } from './tipler';

const GUN = 86_400_000;

export const MOCK_PLANLAR: AbonelikPlani[] = [
  {
    kod: 'baslangic',
    ad: 'Başlangıç',
    kurumTuru: 'bireysel',
    aylikFiyatKurus: 29900,
    yillikFiyatKurus: 299000,
    maxOgrenci: 15,
    maxOgretmen: 1,
    magazaUrunKodlari: { apple: 'kopru.baslangic.aylik', google: 'kopru_baslangic' },
  },
  {
    kod: 'koc',
    ad: 'Koç',
    kurumTuru: 'bireysel',
    aylikFiyatKurus: 69900,
    yillikFiyatKurus: 699000,
    maxOgrenci: 60,
    maxOgretmen: 1,
    magazaUrunKodlari: { apple: 'kopru.koc.aylik', google: 'kopru_koc' },
  },
];

/**
 * Mock senaryolari (`EXPO_PUBLIC_MOCK_ABONELIK`, virgulle birlestirilebilir):
 * deneme (varsayilan), deneme_bitiyor, ek_sure, askida (abonelik askida: yazma kilitli),
 * iptal (magazada iptal, donem sonuna kadar), aktif_apple, aktif_google, aktif_iyzico, kurumsal,
 * limit_dolu (yazma 402 plan_limiti), salt_okunur (yazma 402 abonelik_gerekli), kurum_askida (403),
 * mesaj (platform mesaji var).
 */
export type MockAbonelikSenaryosu =
  | 'deneme'
  | 'deneme_bitiyor'
  | 'ek_sure'
  | 'askida'
  | 'iptal'
  | 'aktif_apple'
  | 'aktif_google'
  | 'aktif_iyzico'
  | 'kurumsal'
  | 'limit_dolu'
  | 'salt_okunur'
  | 'kurum_askida'
  | 'mesaj';

export interface MockAbonelikKontrolu {
  adaptor: AbonelikAdapter;
  senaryo: (...adlar: MockAbonelikSenaryosu[]) => void;
  /** Sahte magazada satin alma: abonelik `aktif` olur (gercekte RevenueCat webhook'u). */
  satinAlindi: (planKodu: string, kaynak: 'apple' | 'google') => void;
  /** Yazma islemlerinde senaryoya gore atilacak hata (yoksa null). */
  yazmaHatasi: () => ApiHata | null;
  /** Okumalarda atilacak hata (kurum_askida). */
  okumaHatasi: () => ApiHata | null;
  /** Mesaj kapatma/degistirme testleri icin. */
  mesajiAyarla: (m: PlatformMesaji | null) => void;
  /** `ozet` cagri sayisi (yoklama testleri). */
  ozetCagrilari: () => number;
}

export const MOCK_PLATFORM_MESAJI: PlatformMesaji = {
  id: '0190f3a0-0000-7000-8000-00000000a001',
  baslik: 'Planlı bakım',
  metin: 'Bu gece 02:00 ile 03:00 arasında kısa bir bakım yapılacak.',
  onem: 'uyari',
};

export function mockAbonelik(
  sec: MockOperasyonSecenekleri,
  baslangic: readonly MockAbonelikSenaryosu[] = ['deneme'],
): MockAbonelikKontrolu {
  const simdi = () => sec.simdi?.() ?? Date.now();
  let senaryolar = new Set<MockAbonelikSenaryosu>(baslangic);
  let magazaPlani: { kod: string; kaynak: 'apple' | 'google' } | null = null;
  let mesaj: PlatformMesaji | null = baslangic.includes('mesaj') ? MOCK_PLATFORM_MESAJI : null;
  let ozetSayaci = 0;
  const var_ = (s: MockAbonelikSenaryosu) => senaryolar.has(s);
  const plan = (kod: string): AbonelikPlani => {
    const p = MOCK_PLANLAR.find((x) => x.kod === kod);
    if (!p) throw new Error(`mock plan yok: ${kod}`);
    return p;
  };

  function abonelikUret(): Abonelik | null {
    const t = simdi();
    const iso = (ms: number) => new Date(ms).toISOString();
    const taban = {
      periyot: 'aylik' as const,
      denemeBitis: null,
      ekSureBitis: null,
      iptalIstendi: null,
      otomatikYenileme: true,
      donemBitis: iso(t + 30 * GUN),
    };
    const magaza = (kaynak: AbonelikKaynagi, planKodu: string): Abonelik => ({
      ...taban,
      durum: 'aktif',
      kaynak,
      plan: plan(planKodu),
    });
    if (magazaPlani) return magaza(magazaPlani.kaynak, magazaPlani.kod);
    if (var_('aktif_apple')) return magaza('apple', 'baslangic');
    if (var_('aktif_google')) return magaza('google', 'baslangic');
    if (var_('aktif_iyzico')) return magaza('iyzico', 'koc');
    if (var_('kurumsal')) return magaza('kurumsal', 'koc');
    if (var_('iptal')) {
      return {
        ...magaza('apple', 'baslangic'),
        otomatikYenileme: false,
        iptalIstendi: iso(t - 2 * GUN),
        donemBitis: iso(t + 9 * GUN),
      };
    }
    if (var_('askida')) {
      return { ...taban, durum: 'askida', kaynak: 'apple', plan: plan('baslangic') };
    }
    if (var_('ek_sure')) {
      return {
        ...taban,
        durum: 'ek_sure',
        kaynak: 'apple',
        plan: plan('baslangic'),
        ekSureBitis: iso(t + 5 * GUN - 3_600_000),
      };
    }
    return {
      ...taban,
      durum: 'deneme',
      kaynak: 'deneme',
      plan: plan('baslangic'),
      denemeBitis: iso(t + (var_('deneme_bitiyor') ? 2 : 12) * GUN - 3_600_000),
    };
  }

  const adaptor: AbonelikAdapter = {
    async ozet(): Promise<AbonelikOzeti> {
      ozetSayaci++;
      await sec.bekle(sec.gecikmeMs / 2);
      await sec.oturumGerekli();
      const okuma = okumaHatasi();
      if (okuma) throw okuma;
      const abonelik = abonelikUret();
      const ust = abonelik?.plan.maxOgrenci ?? 15;
      return {
        abonelik,
        kullanim: {
          ogrenci: { mevcut: var_('limit_dolu') ? ust : 9, ustSinir: ust },
          ogretmen: { mevcut: 1, ustSinir: abonelik?.plan.maxOgretmen ?? 1 },
        },
        ucretsiz: abonelik === null,
        yazmaKilitli: abonelik?.durum === 'askida' || var_('salt_okunur'),
      };
    },
    async planlar() {
      await sec.bekle(sec.gecikmeMs / 2);
      await sec.oturumGerekli();
      return MOCK_PLANLAR.map((p) => ({ ...p }));
    },
    async platformMesaji() {
      await sec.bekle(sec.gecikmeMs / 4);
      return mesaj;
    },
  };

  function okumaHatasi(): ApiHata | null {
    return var_('kurum_askida')
      ? new ApiHata('kurum_askida', undefined, { durum: 403, ayrinti: 'kurum_askida' })
      : null;
  }

  return {
    adaptor,
    senaryo(...adlar) {
      senaryolar = new Set(adlar);
      magazaPlani = null;
      mesaj = senaryolar.has('mesaj') ? MOCK_PLATFORM_MESAJI : null;
    },
    satinAlindi(kod, kaynak) {
      magazaPlani = { kod, kaynak };
    },
    yazmaHatasi() {
      if (var_('kurum_askida')) return okumaHatasi();
      if (var_('limit_dolu')) {
        return new ApiHata('plan_limiti', undefined, {
          durum: 402,
          ayrinti: 'plan_limiti',
          detay: { limit: 'max_ogrenci', mevcut: 15, ust_sinir: 15 },
        });
      }
      if (var_('salt_okunur') || var_('askida')) {
        return new ApiHata('abonelik_gerekli', undefined, {
          durum: 402,
          ayrinti: 'abonelik_gerekli',
        });
      }
      return null;
    },
    okumaHatasi,
    mesajiAyarla(m) {
      mesaj = m;
    },
    ozetCagrilari: () => ozetSayaci,
  };
}
