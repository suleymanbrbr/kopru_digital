import { apiHatasiMi } from '../api/tipler';
import type { KvDepo } from '../depo/kv';

/** Kuyrukta bekleyen bir degisiklik (ornegin yoklama). */
export interface KuyrukIsi {
  /** `istek_id`: istemcide uretilen idempotency anahtari; her denemede ayni gonderilir. */
  istekId: string;
  /** Isleyici anahtari, ornegin 'yoklama.kaydet'. */
  tur: string;
  /** JSON'a cevrilebilir yuk. */
  yuk: unknown;
  /** Isin ait oldugu kapsam (uyelik). Yalnizca etkin kapsamin isleri gonderilir. */
  kapsam: string;
  olusturulduAt: number;
  deneme: number;
  sonrakiDenemeAt: number;
  sonHata?: string;
  /** Son hatanin makine kodu (api `ayrinti` ya da adaptor kodu); arayuz Turkce mesaj secer. */
  sonHataKodu?: string;
}

export type IsIsleyici = (is: KuyrukIsi) => Promise<void>;

export interface AgGozlemcisi {
  cevrimiciMi: () => boolean;
  /** Baglanti degisince cagrilir; dondurulen fonksiyon aboneligi kaldirir. */
  abone: (dinleyici: (cevrimici: boolean) => void) => () => void;
}

export interface KuyrukSecenekleri {
  depo: KvDepo;
  yeniId: () => string;
  /** Gecerli kapsam (uyelik kimligi); yoksa null -> hicbir is gonderilmez. */
  kapsam: () => string | null;
  cevrimiciMi?: () => boolean;
  simdi?: () => number;
  anahtar?: string;
  enFazlaDeneme?: number;
  /** n. basarisiz denemeden sonra beklenecek ms. */
  gecikme?: (deneme: number) => number;
}

export interface BosaltmaSonucu {
  gonderilen: number;
  bekleyen: number;
  basarisiz: number;
}

interface Kalici {
  surum: 1;
  bekleyen: KuyrukIsi[];
  basarisiz: KuyrukIsi[];
}

const ustelGecikme = (deneme: number) => Math.min(2 ** deneme * 1000, 5 * 60_000);

/**
 * Kalici, sirali (FIFO) cevrimdisi mutasyon kuyrugu. Cevrimici olunca `bosalt` ile tekrar oynatilir.
 *  - Tekrar edilebilir hata (ag, 5xx): is kuyrukta kalir, ustel geri cekilme ile yeniden denenir;
 *    siradaki isler beklemeye alinir (sira korunur).
 *  - Kalici hata (4xx): is `basarisiz` listesine tasinir, kuyruk devam eder.
 *  - `yetkisiz`: is korunur, bosaltma durur (oturum yenilenince devam).
 */
export class OfflineKuyruk {
  private durum: Kalici;
  private readonly isleyiciler = new Map<string, IsIsleyici>();
  private readonly dinleyiciler = new Set<() => void>();
  private suruyor: Promise<BosaltmaSonucu> | null = null;
  private zamanlayici: ReturnType<typeof setTimeout> | null = null;
  private readonly anahtar: string;

  constructor(private readonly sec: KuyrukSecenekleri) {
    this.anahtar = sec.anahtar ?? 'kopru.kuyruk.v1';
    this.durum = this.oku();
  }

  private simdi() {
    return this.sec.simdi?.() ?? Date.now();
  }

  private oku(): Kalici {
    const bos: Kalici = { surum: 1, bekleyen: [], basarisiz: [] };
    const ham = this.sec.depo.getString(this.anahtar);
    if (!ham) return bos;
    try {
      const v = JSON.parse(ham) as Partial<Kalici>;
      if (v.surum !== 1 || !Array.isArray(v.bekleyen) || !Array.isArray(v.basarisiz)) return bos;
      return { surum: 1, bekleyen: v.bekleyen, basarisiz: v.basarisiz };
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

  kaydet(tur: string, isleyici: IsIsleyici) {
    this.isleyiciler.set(tur, isleyici);
  }

  /** Isi ekler. Ayni `istekId` zaten kuyrukta/basarisizsa tekrar eklenmez. */
  ekle(tur: string, yuk: unknown, secenek?: { istekId?: string }): KuyrukIsi {
    const istekId = secenek?.istekId ?? this.sec.yeniId();
    const var_ = [...this.durum.bekleyen, ...this.durum.basarisiz].find(
      (i) => i.istekId === istekId,
    );
    if (var_) return var_;
    const is: KuyrukIsi = {
      istekId,
      tur,
      yuk,
      kapsam: this.sec.kapsam() ?? '',
      olusturulduAt: this.simdi(),
      deneme: 0,
      sonrakiDenemeAt: 0,
    };
    this.durum = { ...this.durum, bekleyen: [...this.durum.bekleyen, is] };
    this.yaz();
    return is;
  }

  bekleyenler(): readonly KuyrukIsi[] {
    return this.durum.bekleyen;
  }

  basarisizlar(): readonly KuyrukIsi[] {
    return this.durum.basarisiz;
  }

  /** Basarisiz bir isi yeniden kuyruga alir. */
  yenidenDene(istekId: string) {
    const is = this.durum.basarisiz.find((i) => i.istekId === istekId);
    if (!is) return;
    this.durum = {
      ...this.durum,
      basarisiz: this.durum.basarisiz.filter((i) => i.istekId !== istekId),
      bekleyen: [...this.durum.bekleyen, { ...is, deneme: 0, sonrakiDenemeAt: 0 }],
    };
    this.yaz();
  }

  sil(istekId: string) {
    this.durum = {
      ...this.durum,
      bekleyen: this.durum.bekleyen.filter((i) => i.istekId !== istekId),
      basarisiz: this.durum.basarisiz.filter((i) => i.istekId !== istekId),
    };
    this.yaz();
  }

  abone(dinleyici: () => void) {
    this.dinleyiciler.add(dinleyici);
    return () => this.dinleyiciler.delete(dinleyici);
  }

  /** Tek seferde bir bosaltma calisir; eszamanli cagrilar ayni sonucu bekler. */
  bosalt(): Promise<BosaltmaSonucu> {
    this.suruyor ??= this.calistir().finally(() => {
      this.suruyor = null;
    });
    return this.suruyor;
  }

  private sonuc(gonderilen: number): BosaltmaSonucu {
    return {
      gonderilen,
      bekleyen: this.durum.bekleyen.length,
      basarisiz: this.durum.basarisiz.length,
    };
  }

  private async calistir(): Promise<BosaltmaSonucu> {
    let gonderilen = 0;
    const cevrimici = this.sec.cevrimiciMi ?? (() => true);
    const enFazla = this.sec.enFazlaDeneme ?? 8;
    const gecikme = this.sec.gecikme ?? ustelGecikme;

    for (;;) {
      const kapsam = this.sec.kapsam();
      if (!cevrimici() || kapsam === null) break;
      const is = this.durum.bekleyen.find((i) => i.kapsam === kapsam);
      if (!is || is.sonrakiDenemeAt > this.simdi()) break;

      const isleyici = this.isleyiciler.get(is.tur);
      if (!isleyici) break; // isleyici henuz kayitli degil; isi koru

      try {
        await isleyici(is);
        this.durum = { ...this.durum, bekleyen: this.durum.bekleyen.filter((i) => i !== is) };
        this.yaz();
        gonderilen += 1;
      } catch (e) {
        if (apiHatasiMi(e) && e.kod === 'yetkisiz') break;
        const tekrar = !apiHatasiMi(e) || e.yenidenDenenebilir;
        const deneme = is.deneme + 1;
        const hata = e instanceof Error ? e.message : String(e);
        const hataKodu = apiHatasiMi(e) ? (e.ayrinti ?? e.kod) : undefined;
        if (tekrar && deneme < enFazla) {
          this.guncelle(is, {
            deneme,
            sonHata: hata,
            ...(hataKodu ? { sonHataKodu: hataKodu } : {}),
            sonrakiDenemeAt: this.simdi() + gecikme(deneme),
          });
          break;
        }
        this.durum = {
          ...this.durum,
          bekleyen: this.durum.bekleyen.filter((i) => i !== is),
          basarisiz: [
            ...this.durum.basarisiz,
            { ...is, deneme, sonHata: hata, ...(hataKodu ? { sonHataKodu: hataKodu } : {}) },
          ],
        };
        this.yaz();
      }
    }
    return this.sonuc(gonderilen);
  }

  private guncelle(is: KuyrukIsi, degisim: Partial<KuyrukIsi>) {
    this.durum = {
      ...this.durum,
      bekleyen: this.durum.bekleyen.map((i) => (i === is ? { ...i, ...degisim } : i)),
    };
    this.yaz();
  }

  /**
   * Agi izler: cevrimici olunca bosaltir; geri cekilme bekleyen is varsa zamanlayiciyla tekrar dener.
   * Dondurulen fonksiyon her seyi birakir.
   */
  baglan(ag: AgGozlemcisi): () => void {
    const planla = () => {
      if (this.zamanlayici) clearTimeout(this.zamanlayici);
      this.zamanlayici = null;
      const siradaki = this.durum.bekleyen[0];
      if (!siradaki || !ag.cevrimiciMi()) return;
      const bekleme = Math.max(siradaki.sonrakiDenemeAt - this.simdi(), 0);
      if (bekleme === 0 && siradaki.deneme === 0) return;
      this.zamanlayici = setTimeout(() => void tetikle(), bekleme + 50);
    };
    const tetikle = async () => {
      await this.bosalt();
      planla();
    };
    const birak = ag.abone((cevrimici) => {
      if (cevrimici) void tetikle();
      else planla();
    });
    if (ag.cevrimiciMi()) void tetikle();
    return () => {
      birak();
      if (this.zamanlayici) clearTimeout(this.zamanlayici);
      this.zamanlayici = null;
    };
  }
}
