import type { MedyaAdapter, MedyaTuru, YuklemeAdresi } from '../api/medyaTipleri';
import { apiHatasiMi } from '../api/tipler';
import type { KvDepo } from '../depo/kv';
import type { AgGozlemcisi } from '../offline/kuyruk';

/**
 * Yukleme durum makinesi (her dosya icin, kalici):
 *
 * ```
 * bekliyor --izinAl--> izin_alindi --PUT--> yukleniyor --tamam--> tamam --hazir bekle--> hazir
 *     ^                    |  (adres suresi doldu)         |
 *     +--------------------+-------------------------------+   (PUT adresi gecersiz / nesne yok)
 * herhangi bir adim --kalici hata--> hata
 * ```
 *
 *  - `istemciAnahtari` her yeni izinde ayni gonderilir: medya ayni kaydi ve YENI PUT adresini verir.
 *  - Uygulama `yukleniyor` iken kapanirsa acilista ONCE `tamam` sorulur (arka plan oturumu PUT'u
 *    bitirmis olabilir); nesne yoksa (409 `yukleme_bulunamadi`) PUT bastan yapilir. Tek PUT
 *    parcalanamaz: "kaldigi yerden devam" = dosya kaydi + izin korunur, yalniz eksik adim tekrarlanir.
 *  - Gecici hata (ag, zaman asimi, 5xx, 429): ustel geri cekilme (en cok 60 sn), `deneme` sayilir.
 *    Cevrimdisi iken hicbir istek denenmez. `yetkisiz`: bekler (oturum yenilenince devam).
 *  - Kalici hata (415, 413, 403 tur yetkisi, 422 ...) ya da `EN_FAZLA_DENEME`: `hata`.
 */
export type YuklemeDurumu =
  | 'bekliyor'
  | 'izin_alindi'
  | 'yukleniyor'
  | 'tamam'
  | 'hazir'
  | 'hata';

export interface YuklemeKaydi {
  id: string;
  /** Medya `istemci_anahtari` (UUID): bu dosyanin omru boyunca sabit. */
  istemciAnahtari: string;
  kapsam: string;
  tur: MedyaTuru;
  mimeTipi: string;
  yerelUri: string;
  boyutBayt: number | null;
  sha256: string | null;
  durum: YuklemeDurumu;
  dosyaId: string | null;
  yukleme: YuklemeAdresi | null;
  deneme: number;
  sonrakiDenemeAt: number;
  /** Son hatanin makine kodu (api `ayrinti` / adaptor kodu). */
  hataKodu?: string;
  olusturulduAt: number;
}

export const YUKLEME_EN_FAZLA_DENEME = 40;
const ADRES_PAYI_MS = 30_000;
/** `tamam` sonrasi `hazir` icin tek turdaki yoklama sayisi ve araligi. */
const HAZIR_YOKLAMA = { sayi: 12, araMs: 800 } as const;

export const yuklemeGecikmesi = (deneme: number) => Math.min(2 ** Math.min(deneme, 6) * 1000, 60_000);

export interface YerelDosyalar {
  /** Gecici dosyayi kalici konuma tasir ve yeni uri'yi dondurur. */
  kalici: (uri: string, ad: string) => Promise<string>;
  sil: (uri: string) => Promise<void>;
}

export interface YuklemeSecenekleri {
  depo: KvDepo;
  yeniId: () => string;
  kapsam: () => string | null;
  medya: () => MedyaAdapter;
  yerel: YerelDosyalar;
  cevrimiciMi?: () => boolean;
  simdi?: () => number;
  bekle?: (ms: number) => Promise<void>;
  gecikme?: (deneme: number) => number;
  anahtar?: string;
}

interface Kalici {
  surum: 1;
  kayitlar: YuklemeKaydi[];
}

const uyu = (ms: number) =>
  new Promise<void>((coz) => {
    setTimeout(coz, ms);
  });

/**
 * Kalici yukleme kuyrugu. `calistir` cagrilari birlesir; her dosya kendi adimlarini bagimsiz surer
 * (en cok 2 dosya ayni anda). Olaylar `abone` ile dinlenir.
 */
export class YuklemeKuyrugu {
  private durum: Kalici;
  private readonly dinleyiciler = new Set<() => void>();
  private readonly islenen = new Set<string>();
  private suruyor: Promise<void> | null = null;
  private tekrar = false;
  private zamanlayici: ReturnType<typeof setTimeout> | null = null;
  private ag: AgGozlemcisi | null = null;
  private readonly anahtar: string;

  constructor(private readonly sec: YuklemeSecenekleri) {
    this.anahtar = sec.anahtar ?? 'kopru.yukleme.v1';
    this.durum = this.oku();
  }

  private simdi() {
    return this.sec.simdi?.() ?? Date.now();
  }

  private oku(): Kalici {
    const bos: Kalici = { surum: 1, kayitlar: [] };
    const ham = this.sec.depo.getString(this.anahtar);
    if (!ham) return bos;
    try {
      const v = JSON.parse(ham) as Partial<Kalici>;
      if (v.surum !== 1 || !Array.isArray(v.kayitlar)) return bos;
      return { surum: 1, kayitlar: v.kayitlar };
    } catch {
      return bos;
    }
  }

  private yaz() {
    this.sec.depo.set(this.anahtar, JSON.stringify(this.durum));
    this.dinleyiciler.forEach((d) => {
      d();
    });
  }

  private degistir(id: string, degisim: Partial<YuklemeKaydi>): YuklemeKaydi | undefined {
    let sonuc: YuklemeKaydi | undefined;
    this.durum = {
      ...this.durum,
      kayitlar: this.durum.kayitlar.map((k) => {
        if (k.id !== id) return k;
        sonuc = { ...k, ...degisim };
        return sonuc;
      }),
    };
    if (sonuc) this.yaz();
    return sonuc;
  }

  abone(dinleyici: () => void): () => void {
    this.dinleyiciler.add(dinleyici);
    return () => {
      this.dinleyiciler.delete(dinleyici);
    };
  }

  liste(): readonly YuklemeKaydi[] {
    return this.durum.kayitlar;
  }

  al(id: string): YuklemeKaydi | undefined {
    return this.durum.kayitlar.find((k) => k.id === id);
  }

  /** Dosyayi kalici konuma alir, kuyruga yazar ve yuklemeyi baslatir. */
  async ekle(girdi: { tur: MedyaTuru; mimeTipi: string; yerelUri: string }): Promise<YuklemeKaydi> {
    const id = this.sec.yeniId();
    const uzanti = girdi.mimeTipi === 'audio/mp4' ? 'm4a' : girdi.mimeTipi.split('/')[1] ?? 'bin';
    const yerelUri = await this.sec.yerel.kalici(girdi.yerelUri, `${id}.${uzanti}`);
    const kayit: YuklemeKaydi = {
      id,
      istemciAnahtari: this.sec.yeniId(),
      kapsam: this.sec.kapsam() ?? '',
      tur: girdi.tur,
      mimeTipi: girdi.mimeTipi,
      yerelUri,
      boyutBayt: null,
      sha256: null,
      durum: 'bekliyor',
      dosyaId: null,
      yukleme: null,
      deneme: 0,
      sonrakiDenemeAt: 0,
      olusturulduAt: this.simdi(),
    };
    this.durum = { ...this.durum, kayitlar: [...this.durum.kayitlar, kayit] };
    this.yaz();
    void this.calistir();
    return kayit;
  }

  /** `hata` durumundaki dosyayi bastan dener (kimlik ve anahtar korunur). */
  yenidenDene(id: string) {
    const k = this.al(id);
    if (k?.durum !== 'hata') return;
    this.degistir(id, {
      durum: 'bekliyor',
      deneme: 0,
      sonrakiDenemeAt: 0,
      yukleme: null,
    });
    void this.calistir();
  }

  /** Kaydi ve yerel dosyayi siler. */
  async sil(id: string) {
    const k = this.al(id);
    this.durum = { ...this.durum, kayitlar: this.durum.kayitlar.filter((x) => x.id !== id) };
    this.yaz();
    if (k) await this.sec.yerel.sil(k.yerelUri);
  }

  /** Tum kayitlari (cikista) siler. */
  async temizle() {
    const hepsi = this.durum.kayitlar;
    this.durum = { surum: 1, kayitlar: [] };
    this.yaz();
    await Promise.all(hepsi.map((k) => this.sec.yerel.sil(k.yerelUri)));
  }

  /** Eszamanli cagrilar birlesir; surerken gelen cagri bir tur daha calistirir. */
  calistir(): Promise<void> {
    if (this.suruyor) {
      this.tekrar = true;
      return this.suruyor;
    }
    this.suruyor = this.tur().finally(() => {
      this.suruyor = null;
      this.planla();
      if (this.tekrar) {
        this.tekrar = false;
        void this.calistir();
      }
    });
    return this.suruyor;
  }

  private async tur() {
    const cevrimici = this.sec.cevrimiciMi ?? (() => true);
    const kapsam = this.sec.kapsam();
    if (!cevrimici() || kapsam === null) return;
    const simdi = this.simdi();
    const hazirlar = this.durum.kayitlar.filter(
      (k) =>
        k.kapsam === kapsam &&
        k.durum !== 'hazir' &&
        k.durum !== 'hata' &&
        k.sonrakiDenemeAt <= simdi &&
        !this.islenen.has(k.id),
    );
    // En cok 2 dosya ayni anda: zayif baglantida bant genisligi bolunmesin.
    const kuyruk = [...hazirlar];
    const isci = async () => {
      for (;;) {
        const k = kuyruk.shift();
        if (!k) return;
        this.islenen.add(k.id);
        try {
          await this.ilerlet(k.id);
        } finally {
          this.islenen.delete(k.id);
        }
      }
    };
    await Promise.all([isci(), isci()]);
  }

  /** Bir dosyayi `hazir`/`hata`ya ya da bir sonraki bekleme noktasina kadar ilerletir. */
  private async ilerlet(id: string) {
    const medya = this.sec.medya();
    const bekle = this.sec.bekle ?? uyu;
    try {
      for (;;) {
        const k = this.al(id);
        if (!k || k.durum === 'hazir' || k.durum === 'hata') return;

        if (k.durum === 'bekliyor') {
          const bilgi =
            k.boyutBayt !== null && k.sha256 !== null
              ? { boyutBayt: k.boyutBayt, sha256: k.sha256 }
              : await medya.yerelBilgi(k.yerelUri);
          const izin = await medya.izinAl({
            tur: k.tur,
            mimeTipi: k.mimeTipi,
            boyutBayt: bilgi.boyutBayt,
            sha256: bilgi.sha256,
            istemciAnahtari: k.istemciAnahtari,
          });
          const sonraki: YuklemeDurumu =
            izin.durum === 'hazir'
              ? 'hazir'
              : izin.durum === 'yukleme_bekliyor'
                ? 'izin_alindi'
                : 'tamam';
          this.degistir(id, {
            boyutBayt: bilgi.boyutBayt,
            sha256: bilgi.sha256,
            dosyaId: izin.dosyaId,
            yukleme: izin.yukleme,
            durum: sonraki,
            hataKodu: undefined,
          });
          continue;
        }

        if (k.durum === 'izin_alindi') {
          if (!k.yukleme || Date.parse(k.yukleme.bitis) - this.simdi() < ADRES_PAYI_MS) {
            this.degistir(id, { durum: 'bekliyor', yukleme: null });
            continue;
          }
          this.degistir(id, { durum: 'yukleniyor' });
          await medya.yukle(k.yukleme, k.yerelUri, k.mimeTipi);
          this.degistir(id, { durum: 'tamam', deneme: 0 });
          continue;
        }

        if (k.durum === 'yukleniyor') {
          // Onceki oturumda yarida kalmis: nesne yuklendi mi diye sor.
          if (!k.dosyaId) {
            this.degistir(id, { durum: 'bekliyor' });
            continue;
          }
          try {
            await medya.tamam(k.dosyaId);
            this.degistir(id, { durum: 'tamam' });
          } catch (e) {
            if (apiHatasiMi(e) && e.ayrinti === 'yukleme_bulunamadi') {
              this.degistir(id, { durum: 'bekliyor', yukleme: null });
            } else throw e;
          }
          continue;
        }

        // durum === 'tamam'
        if (!k.dosyaId) {
          this.degistir(id, { durum: 'bekliyor' });
          continue;
        }
        let d = await medya.tamam(k.dosyaId);
        for (let i = 0; i < HAZIR_YOKLAMA.sayi && d.durum !== 'hazir'; i++) {
          if (d.durum === 'islenemedi' || d.durum === 'silindi') break;
          await bekle(HAZIR_YOKLAMA.araMs);
          d = await medya.durum(k.dosyaId);
        }
        if (d.durum === 'hazir') {
          this.degistir(id, { durum: 'hazir', hataKodu: undefined });
        } else if (d.durum === 'islenemedi' || d.durum === 'silindi') {
          this.degistir(id, { durum: 'hata', hataKodu: d.hataKodu ?? 'dosya_islenemedi' });
        } else {
          // Isleme surerken hata degil: kisa sure sonra yeniden bakilir (deneme artmaz).
          this.degistir(id, { sonrakiDenemeAt: this.simdi() + 3000 });
          return;
        }
      }
    } catch (e) {
      this.hataIsle(id, e);
    }
  }

  private hataIsle(id: string, e: unknown) {
    const k = this.al(id);
    if (!k) return;
    if (apiHatasiMi(e) && e.kod === 'yetkisiz') return; // oturum yenilenince devam
    const hataKodu = apiHatasiMi(e) ? (e.ayrinti ?? e.kod) : 'bilinmeyen';
    // PUT adresi gecersiz (403) ya da nesne yok: izin bastan alinir; gecici sayilir.
    const adresSorunu = apiHatasiMi(e) && e.ayrinti === 'yukleme_adresi_gecersiz';
    const gecici = !apiHatasiMi(e) || e.yenidenDenenebilir || e.kod === 'cok_istek' || adresSorunu;
    const deneme = k.deneme + 1;
    if (!gecici || deneme >= YUKLEME_EN_FAZLA_DENEME) {
      this.degistir(k.id, { durum: 'hata', deneme, hataKodu });
      return;
    }
    const gecikme = (this.sec.gecikme ?? yuklemeGecikmesi)(deneme);
    this.degistir(k.id, {
      deneme,
      hataKodu,
      sonrakiDenemeAt: this.simdi() + gecikme,
      ...(adresSorunu ? { durum: 'bekliyor' as const, yukleme: null } : {}),
    });
  }

  /** Agi izler: baglanti gelince calistirir; geri cekilmedeki kayit icin zamanlayici kurar. */
  baglan(ag: AgGozlemcisi): () => void {
    this.ag = ag;
    const birak = ag.abone((cevrimici) => {
      if (cevrimici) void this.calistir();
      else this.planla();
    });
    // Acilista `yukleniyor`da kalmis kayitlar (oturum olduruldu) tekrar denenir.
    void this.calistir();
    return () => {
      birak();
      this.ag = null;
      if (this.zamanlayici) clearTimeout(this.zamanlayici);
      this.zamanlayici = null;
    };
  }

  private planla() {
    if (this.zamanlayici) clearTimeout(this.zamanlayici);
    this.zamanlayici = null;
    if (!this.ag?.cevrimiciMi()) return;
    const aktifler = this.durum.kayitlar.filter((k) => k.durum !== 'hazir' && k.durum !== 'hata');
    if (aktifler.length === 0) return;
    const en = Math.min(...aktifler.map((k) => k.sonrakiDenemeAt));
    const bekleme = Math.max(en - this.simdi(), 0);
    this.zamanlayici = setTimeout(
      () => {
        this.zamanlayici = null;
        void this.calistir();
      },
      bekleme + 50,
    );
  }
}
