import type { AbonelikPlani } from '../api/abonelikTipleri';
import {
  MagazaHatasi,
  type MagazaSaglayici,
  type MagazaTeklifi,
  type SatinAlmaSonucu,
} from './tipler';

/** `react-native-purchases` yuzeyinin kullandigimiz dar kismi (modul tembel yuklenir). */
export interface RevenueCatModulu {
  configure: (c: { apiKey: string }) => void;
  logIn: (id: string) => Promise<unknown>;
  logOut: () => Promise<unknown>;
  getOfferings: () => Promise<{
    all: Record<
      string,
      {
        availablePackages: {
          identifier: string;
          product: { identifier: string; priceString: string };
        }[];
      }
    >;
  }>;
  purchasePackage: (paket: unknown) => Promise<unknown>;
  restorePurchases: () => Promise<unknown>;
}

export interface RevenueCatSecenekleri {
  apiAnahtari: string;
  /** Planlar (api `magaza_urun_kodlari`); mağaza urunu bu kodlarla plana eslenir. */
  planlar: () => Promise<readonly AbonelikPlani[]>;
  /** `apple` ya da `google`: hangi urun kodu alani kullanilir. */
  kanal: 'apple' | 'google';
  /** Test icin modul enjeksiyonu; varsayilan gercek `react-native-purchases`. */
  modul?: () => RevenueCatModulu;
}

function gercekModul(): RevenueCatModulu {
  // Native modul yalniz burada, gerektiginde yuklenir (Expo Go / anahtarsiz kosularda hic yuklenmez).

  const m = require('react-native-purchases') as { default: RevenueCatModulu };
  return m.default;
}

function iptalMi(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && (e as { userCancelled?: unknown }).userCancelled === true
  );
}

/** Gercek RevenueCat saglayicisi. Ilk kullanimda `configure` cagrilir. */
export function revenueCatSaglayicisi(sec: RevenueCatSecenekleri): MagazaSaglayici {
  let modul: RevenueCatModulu | null = null;
  const al = (): RevenueCatModulu => {
    if (!modul) {
      modul = (sec.modul ?? gercekModul)();
      modul.configure({ apiKey: sec.apiAnahtari });
    }
    return modul;
  };
  let girisYapan: string | null = null;
  return {
    tur: 'revenuecat',
    async logIn(kurumId) {
      if (girisYapan === kurumId) return;
      await al().logIn(kurumId);
      girisYapan = kurumId;
    },
    async logOut() {
      if (girisYapan === null) return;
      await al().logOut();
      girisYapan = null;
    },
    async teklifleriGetir() {
      let sonuc;
      try {
        sonuc = await al().getOfferings();
      } catch (e) {
        throw new MagazaHatasi('kullanilamiyor', e instanceof Error ? e.message : undefined);
      }
      const planlar = await sec.planlar();
      const teklifler: MagazaTeklifi[] = [];
      for (const o of Object.values(sonuc.all)) {
        for (const p of o.availablePackages) {
          // Google urun kimligi `abonelik:temelplan` bicimindedir; abonelik kodu `:` oncesidir.
          const urun = p.product.identifier.split(':')[0];
          const plan = planlar.find((x) => x.magazaUrunKodlari?.[sec.kanal] === urun);
          if (!plan) continue;
          teklifler.push({
            urunId: p.product.identifier,
            planKodu: plan.kod,
            periyot: 'aylik',
            fiyatMetni: p.product.priceString,
            ham: p,
          });
        }
      }
      return teklifler;
    },
    async satinAl(teklif): Promise<SatinAlmaSonucu> {
      try {
        await al().purchasePackage(teklif.ham);
        return { durum: 'tamam' };
      } catch (e) {
        if (iptalMi(e)) return { durum: 'iptal' };
        throw new MagazaHatasi('satin_alma_basarisiz', e instanceof Error ? e.message : undefined);
      }
    },
    async geriYukle() {
      try {
        await al().restorePurchases();
      } catch (e) {
        throw new MagazaHatasi(
          'geri_yukleme_basarisiz',
          e instanceof Error ? e.message : undefined,
        );
      }
    },
  };
}
