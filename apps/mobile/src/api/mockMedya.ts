import type { MedyaAdapter, MedyaDurumu } from './medyaTipleri';
import { ApiHata } from './tipler';

interface MockDosya {
  id: string;
  durum: MedyaDurumu;
  boyutBayt: number;
  /** `tamam` bu zamana kadar `isleniyor` doner (ms, epoch). */
  hazirAt: number;
  yuklendi: boolean;
}

/** Testlerin ariza enjekte ettigi kancalar. Dondurulen hata firlatilir. */
export interface MockMedyaKancalari {
  izinAl?: (sayi: number) => ApiHata | null;
  yukle?: (sayi: number) => ApiHata | null;
  tamam?: (sayi: number) => ApiHata | null;
}

export interface MockMedyaSecenekleri {
  gecikmeMs?: number;
  /** `tamam`dan sonra dosyanin `hazir` olmasi icin gecen sure (ms). */
  isle?: number;
  simdi?: () => number;
  kancalar?: MockMedyaKancalari;
}

/** Backend olmadan calisan medya adaptoru (bellek ici; "yukleme" yalniz gecikme simule eder). */
export function mockMedya(sec: MockMedyaSecenekleri = {}): MedyaAdapter & {
  /** Test icin: yapilan cagri sayilari. */
  sayilar: { izinAl: number; yukle: number; tamam: number; durum: number };
  dosyalar: Map<string, MockDosya>;
} {
  const simdi = sec.simdi ?? (() => Date.now());
  const gecikme = sec.gecikmeMs ?? 120;
  const isle = sec.isle ?? 400;
  const dosyalar = new Map<string, MockDosya>();
  const anahtarlar = new Map<string, string>();
  const sayilar = { izinAl: 0, yukle: 0, tamam: 0, durum: 0 };
  let n = 0;
  const bekle = () =>
    gecikme > 0 ? new Promise<void>((c) => setTimeout(c, gecikme)) : Promise.resolve();

  function durumYaniti(d: MockDosya) {
    if (d.durum === 'isleniyor' && simdi() >= d.hazirAt) d.durum = 'hazir';
    return { dosyaId: d.id, durum: d.durum, boyutBayt: d.boyutBayt, hataKodu: null };
  }

  return {
    sayilar,
    dosyalar,
    async izinAl(g) {
      sayilar.izinAl += 1;
      await bekle();
      const hata = sec.kancalar?.izinAl?.(sayilar.izinAl);
      if (hata) throw hata;
      let id = anahtarlar.get(g.istemciAnahtari);
      if (!id) {
        id = `00000000-0000-7000-8000-${String(++n).padStart(12, '0')}`;
        anahtarlar.set(g.istemciAnahtari, id);
        dosyalar.set(id, {
          id,
          durum: 'yukleme_bekliyor',
          boyutBayt: g.boyutBayt,
          hazirAt: 0,
          yuklendi: false,
        });
      }
      const d = dosyalar.get(id);
      if (!d) throw new ApiHata('bulunamadi');
      return {
        dosyaId: id,
        durum: d.durum,
        yukleme:
          d.durum === 'yukleme_bekliyor'
            ? {
                url: `http://mock.invalid/${id}`,
                basliklar: { 'content-type': g.mimeTipi },
                bitis: new Date(simdi() + 15 * 60_000).toISOString(),
              }
            : null,
      };
    },
    async yukle(adres) {
      sayilar.yukle += 1;
      await bekle();
      const hata = sec.kancalar?.yukle?.(sayilar.yukle);
      if (hata) throw hata;
      const id = adres.url.split('/').pop() ?? '';
      const d = dosyalar.get(id);
      if (d) d.yuklendi = true;
    },
    async tamam(dosyaId) {
      sayilar.tamam += 1;
      await bekle();
      const hata = sec.kancalar?.tamam?.(sayilar.tamam);
      if (hata) throw hata;
      const d = dosyalar.get(dosyaId);
      if (!d) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      if (d.durum === 'yukleme_bekliyor') {
        if (!d.yuklendi) {
          throw new ApiHata('cakisma', undefined, { durum: 409, ayrinti: 'yukleme_bulunamadi' });
        }
        d.durum = 'isleniyor';
        d.hazirAt = simdi() + isle;
      }
      return durumYaniti(d);
    },
    async durum(dosyaId) {
      sayilar.durum += 1;
      await bekle();
      const d = dosyalar.get(dosyaId);
      if (!d) throw new ApiHata('bulunamadi', undefined, { durum: 404 });
      return durumYaniti(d);
    },
    yerelBilgi(uri) {
      // Gercekci ama deterministik: boyut uri uzunlugundan, ozet uri'den turetilir.
      let h = 0;
      for (const c of uri) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      return Promise.resolve({
        boyutBayt: 250_000 + (h % 150_000),
        sha256: h.toString(16).padStart(8, '0').repeat(8),
      });
    },
  };
}
