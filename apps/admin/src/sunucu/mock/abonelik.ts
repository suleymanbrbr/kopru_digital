import type { MockAbonelik, MockKurum } from './durum';
import { simdi, yeniId } from './durum';
import type { MockYanit } from './yanit';
import { dogrulamaHatasi, hata } from './yanit';

/** Mock plan katalogu (`abonelik.planlar` tohumu ile ayni kodlar). */
export const PLANLAR: Record<
  string,
  { ad: string; kurum_turu: string; aylik: number; yillik: number }
> = {
  baslangic: { ad: 'Başlangıç', kurum_turu: 'bireysel', aylik: 29900, yillik: 299000 },
  koc: { ad: 'Koç', kurum_turu: 'bireysel', aylik: 69900, yillik: 699000 },
  ekip: { ad: 'Ekip', kurum_turu: 'ekip', aylik: 149900, yillik: 1499000 },
  kurum: { ad: 'Kurum', kurum_turu: 'kurum', aylik: 499900, yillik: 4999000 },
};

const GUN_MS = 86_400_000;
const arti = (iso: string, gun: number) => new Date(Date.parse(iso) + gun * GUN_MS).toISOString();

function planCikti(kod: string) {
  const p = PLANLAR[kod] ?? PLANLAR.kurum;
  return {
    id: `0190a600-0000-7000-8000-${kod.length.toString(16).padStart(12, '0')}`,
    kod,
    surum: 1,
    ad: p?.ad ?? kod,
    kurum_turu: p?.kurum_turu ?? 'kurum',
    aylik_fiyat_kurus: p?.aylik ?? 0,
    yillik_fiyat_kurus: p?.yillik ?? 0,
    kdv_orani: 20,
    limitler: {
      max_ogrenci: 500,
      max_ogretmen: 40,
      max_sube: 5,
      medya_kota_bayt: 214748364800,
      sms_aylik: 2000,
      soru_aylik_ogrenci: -1,
    },
    moduller: [],
  };
}

export function abonelikCikti(a: MockAbonelik) {
  return {
    id: a.id,
    durum: a.durum,
    kaynak: a.kaynak,
    periyot: a.periyot,
    fiyat_kurus: a.fiyat_kurus,
    otomatik_yenileme: a.kaynak !== 'kurumsal' && a.kaynak !== 'deneme',
    donem_baslangic_at: a.donem_baslangic_at,
    donem_bitis_at: a.donem_bitis_at,
    deneme_bitis_at: a.deneme_bitis_at ?? null,
    ek_sure_bitis_at: a.ek_sure_bitis_at ?? null,
    iptal_istendi_at: a.iptal_istendi_at ?? null,
    bekleyen_plan_kodu: a.bekleyen_plan_kodu ?? null,
    bekleyen_periyot: null,
    plan: planCikti(a.plan_kodu),
  };
}

/** Abonelik kilitli: yazmaya kapali (askida / sona erdi). */
export const kilitliMi = (a: MockAbonelik) => a.durum === 'askida' || a.durum === 'sona_erdi';

export const askiCikti = (k: MockKurum) => ({
  askida: k.aski !== undefined,
  askida_at: k.aski?.askida_at ?? null,
  neden: k.aski?.neden ?? null,
});

function gecmiseAl(k: MockKurum) {
  k.abonelik.gecmis.push({ ...k.abonelik, gecmis: [], odemeler: [] });
}

const abonelikYaniti = (k: MockKurum): MockYanit => ({
  durum: 200,
  govde: {
    abonelik: abonelikCikti(k.abonelik),
    kurum_durumu: k.durum,
    platform_askida: k.aski !== undefined,
  },
});

/** Kurum durumu: platform askisi varsa ya da abonelik kilitliyse `askida`. */
function durumuYenile(k: MockKurum) {
  k.durum = k.aski || kilitliMi(k.abonelik) ? 'askida' : 'aktif';
}

const gunlu = (g: Record<string, unknown>, en: number): number | null =>
  typeof g.gun === 'number' && Number.isInteger(g.gun) && g.gun >= 1 && g.gun <= en ? g.gun : null;

/**
 * `/platform/kurumlar/:id/abonelik...`, `/askiya-al` ve `/ac` mock'u. `ek`: yol parcalari (kurum kimliginden sonra).
 * Basarili yazmalar icin `denetle(eylem, neden)` cagrilir.
 */
export function abonelikMock(
  k: MockKurum,
  yontem: string,
  ek: readonly string[],
  g: Record<string, unknown>,
  denetle: (eylem: string, neden: string, ayrinti?: Record<string, unknown>) => void,
): MockYanit | null {
  const a = k.abonelik;

  if (ek[0] === 'abonelik' && ek.length === 1 && yontem === 'GET') {
    return {
      durum: 200,
      govde: {
        abonelik: abonelikCikti(a),
        yazma_kilitli: kilitliMi(a),
        gecmis: a.gecmis.map(abonelikCikti),
        odemeler: a.odemeler.map((o) => ({
          ...o,
          abonelik_id: a.id,
          kaynak: a.kaynak,
          donem_baslangic_at: a.donem_baslangic_at,
          donem_bitis_at: a.donem_bitis_at,
          hata_kodu: null,
        })),
      },
    };
  }
  if (yontem !== 'POST') return null;

  const neden = typeof g.neden === 'string' ? g.neden.trim() : '';
  const nedenGecerli = neden.length >= 10 && neden.length <= 500;
  const nedenHatasi = () =>
    dogrulamaHatasi({ path: 'neden', message: 'Neden 10 ile 500 karakter arasında olmalı.' });

  // Platform askisi
  if (ek.length === 1 && (ek[0] === 'askiya-al' || ek[0] === 'ac')) {
    if (!nedenGecerli) return nedenHatasi();
    const al = ek[0] === 'askiya-al';
    const degisti = al ? k.aski === undefined : k.aski !== undefined;
    if (al && degisti) k.aski = { askida_at: simdi(), neden };
    if (!al) k.aski = undefined;
    durumuYenile(k);
    denetle(al ? 'platform.kurum_askiya_al' : 'platform.kurum_ac', neden);
    return {
      durum: 200,
      govde: {
        kurum_id: k.id,
        durum: k.durum,
        degisti,
        platform_aski: askiCikti(k),
        abonelik_kilitli: kilitliMi(a),
      },
    };
  }

  if (ek[0] !== 'abonelik' || ek.length !== 2) return null;
  if (!nedenGecerli) return nedenHatasi();
  const uygunDegil = () => hata(409, 'conflict', 'Abonelik bu işlem için uygun durumda değil.');

  switch (ek[1]) {
    case 'deneme-uzat': {
      const gun = gunlu(g, 90);
      if (gun === null)
        return dogrulamaHatasi({ path: 'gun', message: 'Gün 1 ile 90 arasında olmalı.' });
      if (a.durum !== 'deneme') return uygunDegil();
      a.deneme_bitis_at = arti(a.deneme_bitis_at ?? simdi(), gun);
      a.donem_bitis_at = a.deneme_bitis_at;
      denetle('platform.abonelik_deneme_uzat', neden, { gun });
      return abonelikYaniti(k);
    }
    case 'ek-sure': {
      const gun = gunlu(g, 60);
      if (gun === null)
        return dogrulamaHatasi({ path: 'gun', message: 'Gün 1 ile 60 arasında olmalı.' });
      if (!['odeme_bekliyor', 'askida', 'sona_erdi', 'ek_sure'].includes(a.durum))
        return uygunDegil();
      a.durum = 'ek_sure';
      a.ek_sure_bitis_at = arti(simdi(), gun);
      durumuYenile(k);
      denetle('platform.abonelik_ek_sure', neden, { gun });
      return abonelikYaniti(k);
    }
    case 'kurumsal-aktivasyon': {
      const plan = typeof g.plan_kodu === 'string' ? g.plan_kodu : '';
      const sozlesme = typeof g.sozlesme_no === 'string' ? g.sozlesme_no.trim() : '';
      if (!PLANLAR[plan]) return hata(404, 'plan_bulunamadi', 'Plan bulunamadı.');
      if (sozlesme.length < 1 || sozlesme.length > 100) {
        return dogrulamaHatasi({ path: 'sozlesme_no', message: 'Sözleşme no zorunludur.' });
      }
      const periyot = g.periyot === 'yillik' ? 'yillik' : 'aylik';
      const fiyat = typeof g.fiyat_kurus === 'number' ? g.fiyat_kurus : PLANLAR[plan][periyot];
      gecmiseAl(k);
      a.id = yeniId();
      a.kaynak = 'kurumsal';
      a.durum = 'aktif';
      a.plan_kodu = plan;
      a.periyot = periyot;
      a.fiyat_kurus = fiyat;
      a.donem_baslangic_at = simdi();
      a.donem_bitis_at = arti(a.donem_baslangic_at, periyot === 'yillik' ? 365 : 30);
      delete a.deneme_bitis_at;
      delete a.ek_sure_bitis_at;
      delete a.iptal_istendi_at;
      durumuYenile(k);
      denetle('platform.abonelik_kurumsal_aktivasyon', neden, { plan_kodu: plan });
      return abonelikYaniti(k);
    }
    case 'plan-degistir': {
      const plan = typeof g.plan_kodu === 'string' ? g.plan_kodu : '';
      if (!PLANLAR[plan]) return hata(404, 'plan_bulunamadi', 'Plan bulunamadı.');
      if (a.durum === 'iptal' || a.durum === 'sona_erdi') return uygunDegil();
      if (g.hemen === true) a.plan_kodu = plan;
      else a.bekleyen_plan_kodu = plan;
      denetle('platform.abonelik_plan_degistir', neden, { plan_kodu: plan });
      return abonelikYaniti(k);
    }
    case 'iptal': {
      if (a.durum === 'iptal' || a.durum === 'sona_erdi') return uygunDegil();
      if (g.hemen === true) a.durum = 'iptal';
      else a.iptal_istendi_at = simdi();
      denetle('platform.abonelik_iptal', neden);
      return abonelikYaniti(k);
    }
    case 'askiya-al': {
      if (a.durum === 'askida') return uygunDegil();
      a.durum = 'askida';
      durumuYenile(k);
      denetle('platform.abonelik_askiya_al', neden);
      return abonelikYaniti(k);
    }
    default:
      return null;
  }
}
