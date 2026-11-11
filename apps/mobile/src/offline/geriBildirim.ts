import type { GeriBildirimDegeri, KayitAdapter } from '../api/kayitTipleri';
import { ApiHata, apiHatasiMi } from '../api/tipler';
import type { KvDepo } from '../depo/kv';
import type { KuyrukIsi, OfflineKuyruk } from './kuyruk';

export const GERI_BILDIRIM_TURU = 'geri_bildirim.ver';

/**
 * Kuyruk yuku. `dersBaslik`/`dersBaslangic` basarisiz is listesinde (yoklama ile ayni alan adlari)
 * gosterim icindir; `sonVerme` kartin ne zamana kadar degistirilebilecegini belirler.
 */
export interface GeriBildirimYuku {
  dersId: string;
  dersBaslik: string;
  dersBaslangic: string;
  sonVerme: string;
  deger: GeriBildirimDegeri;
  konuId?: string | null;
  not?: string | null;
}

/** Ekranda gosterilen "verdim" durumu (sunucuda ogrencinin kendi gecmisini listeleyen uc yoktur). */
export type VerilenGeriBildirim = Omit<GeriBildirimYuku, 'konuId' | 'not'> & {
  konuId: string | null;
  not: string | null;
};

/**
 * `geri_bildirim.ver` isleyicisi. PUT idempotenttir (ayni ders icin son deger kazanir; olay yalniz
 * ilk verista yayimlanir), bu yuzden yeniden deneme guvenlidir ve `Idempotency-Key` gerekmez.
 *  - 429 gecici sayilir; 4xx (`modul_kapali`, `geri_bildirim_yoklama_uygun_degil`,
 *    `geri_bildirim_guncelleme_suresi_doldu` ...) kalici hata olarak `basarisiz` listesine duser ve
 *    kart yerel durumdan kaldirilir (sunucuda kayit yoktur).
 */
export function geriBildirimIsleyicisiKaydet(
  kuyruk: OfflineKuyruk,
  kayit: () => KayitAdapter,
  secenek: { basarili?: () => void; reddedildi?: (yuk: GeriBildirimYuku) => void } = {},
) {
  kuyruk.kaydet(GERI_BILDIRIM_TURU, async (is: KuyrukIsi) => {
    const yuk = is.yuk as GeriBildirimYuku;
    try {
      await kayit().geriBildirimVer(yuk.dersId, {
        deger: yuk.deger,
        konuId: yuk.konuId ?? null,
        not: yuk.not ?? null,
      });
    } catch (e) {
      if (apiHatasiMi(e) && e.kod === 'cok_istek') {
        throw new ApiHata('sunucu', e.message, { durum: 429, yenidenDenenebilir: true });
      }
      if (apiHatasiMi(e) && !e.yenidenDenenebilir && e.kod !== 'yetkisiz') {
        secenek.reddedildi?.(yuk);
      }
      throw e;
    }
    secenek.basarili?.();
  });
}

/** Geri bildirimi kuyruga alir (iyimser: arayuz hemen "verildi" gosterir) ve bosaltmayi tetikler. */
export function geriBildirimKuyrugaAl(kuyruk: OfflineKuyruk, yuk: GeriBildirimYuku): KuyrukIsi {
  const is = kuyruk.ekle(GERI_BILDIRIM_TURU, yuk);
  void kuyruk.bosalt();
  return is;
}

// --- Yerel "verdim" deposu ------------------------------------------------------------------

type Kalici = Record<string, VerilenGeriBildirim[]>;

const BOS: readonly VerilenGeriBildirim[] = [];

/**
 * Verilen geri bildirimlerin kalici yerel kaydi (uyelik kapsamli). Sunucu "bekleyen" listesinden
 * verilen dersi cikardigi icin, kartin "Tesekkurler / degistir" durumu buradan gelir. `sonVerme`
 * gecen kayitlar okunurken ayiklanir.
 */
export class GeriBildirimDeposu {
  private durum: Kalici;
  private readonly onbellek = new Map<string, readonly VerilenGeriBildirim[]>();
  private readonly dinleyiciler = new Set<() => void>();

  constructor(
    private readonly depo: KvDepo,
    private readonly anahtar = 'kopru.geri-bildirim.v1',
  ) {
    this.durum = this.oku();
  }

  private oku(): Kalici {
    const ham = this.depo.getString(this.anahtar);
    if (!ham) return {};
    try {
      const v = JSON.parse(ham) as unknown;
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Kalici) : {};
    } catch {
      return {};
    }
  }

  private yaz() {
    this.depo.set(this.anahtar, JSON.stringify(this.durum));
    this.onbellek.clear();
    this.dinleyiciler.forEach((d) => {
      d();
    });
  }

  /** Kararli (referansi degismeyen) dizi dondurur; `useSyncExternalStore` ile guvenlidir. */
  al(kapsam: string | null | undefined): readonly VerilenGeriBildirim[] {
    if (!kapsam) return BOS;
    let s = this.onbellek.get(kapsam);
    if (!s) {
      s = this.durum[kapsam] ?? BOS;
      this.onbellek.set(kapsam, s);
    }
    return s;
  }

  /** Ayni ders icin onceki kayit degistirilir. Suresi gecenler atilir. */
  ekle(kapsam: string, v: VerilenGeriBildirim, simdi = Date.now()) {
    const kalan = (this.durum[kapsam] ?? []).filter(
      (x) => x.dersId !== v.dersId && Date.parse(x.sonVerme) > simdi,
    );
    this.durum = { ...this.durum, [kapsam]: [...kalan, v] };
    this.yaz();
  }

  kaldir(kapsam: string, dersId: string) {
    const eski = this.durum[kapsam];
    if (!eski?.some((x) => x.dersId === dersId)) return;
    this.durum = { ...this.durum, [kapsam]: eski.filter((x) => x.dersId !== dersId) };
    this.yaz();
  }

  temizle() {
    this.durum = {};
    this.depo.remove(this.anahtar);
    this.onbellek.clear();
    this.dinleyiciler.forEach((d) => {
      d();
    });
  }

  abone(dinleyici: () => void): () => void {
    this.dinleyiciler.add(dinleyici);
    return () => {
      this.dinleyiciler.delete(dinleyici);
    };
  }
}
