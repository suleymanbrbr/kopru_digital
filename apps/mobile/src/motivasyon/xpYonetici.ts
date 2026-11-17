import type { MotivasyonDurumu } from '../api/motivasyonTipleri';
import { xpFarki, type XpFarki } from './xpFarki';

/** Ekranin gosterecegi XP olayi: fark + yeni durum (karakter bilgisi icin). */
export interface XpOlayi {
  fark: XpFarki;
  durum: MotivasyonDurumu;
}

export interface XpYoneticiSecenekleri {
  /** `benim` anligini taze okur. */
  getir: () => Promise<MotivasyonDurumu>;
  /** Eylem sonrasi XP geri bildirimi bu oturumda gecerli mi (ogrenci + `oyunlastirma` acik). */
  etkin: () => boolean;
  /** Taze durumu onbellege yazar (ekranlar guncellensin). */
  kaydet?: (d: MotivasyonDurumu) => void;
  /** Eylemden sonra denemeler arasi bekleme (ms): XP olayi sunucuda asenkron islenir. */
  gecikmeler?: readonly number[];
  bekle?: (ms: number) => Promise<void>;
}

/** Sunucuda XP yazimi olay hattindan gecer: ilk deneme kisa gecikmeyle, sonrakiler gevsekce. */
export const XP_GECIKMELERI: readonly number[] = [1200, 2000, 3500];

/**
 * Merkezi XP geri bildirimi. Ogrenci bir eylem (plan gorevi gerceklesen, odev teslim, soru, geri
 * bildirim, kayit izledim, odak bitisi) tamamlayinca `eylemTamam()` cagrilir; yonetici kisa
 * gecikmeyle `benim`i yeniden ceker ve bilinen son durumla karsilastirir. Fark varsa dinleyicilere
 * (`XpKatmani`) "+N XP", seviye atlama ve evrim bilgisini yollar.
 *
 * Taban cizgisi: son gozlenen durum (`gozlemle`). Ekranlar `benim`i her okuduklarinda gozlemler;
 * taban yoksa (ilk eylem) ilk taze okuma tabani kurar ve olay uretmez.
 */
export class XpYoneticisi {
  private son: MotivasyonDurumu | null = null;
  private readonly dinleyiciler = new Set<(o: XpOlayi) => void>();
  private calisiyor: Promise<void> | null = null;
  private bekleyen = false;
  private nesil = 0;

  constructor(private readonly sec: XpYoneticiSecenekleri) {}

  abone(dinleyici: (o: XpOlayi) => void): () => void {
    this.dinleyiciler.add(dinleyici);
    return () => this.dinleyiciler.delete(dinleyici);
  }

  /** Ekranin okudugu durum taban cizgisini gunceller (olay uretmez). */
  gozlemle(d: MotivasyonDurumu): void {
    this.son = d;
  }

  /** Cikis / kurum degisimi: taban cizgisi ve bekleyen isler atilir. */
  sifirla(): void {
    this.son = null;
    this.bekleyen = false;
    this.nesil += 1;
  }

  /** Bir eylem tamamlandi. Hemen doner; sonuc dinleyicilere gelir. */
  eylemTamam(): Promise<void> {
    if (!this.sec.etkin()) return Promise.resolve();
    this.bekleyen = true;
    this.calisiyor ??= this.dongu().finally(() => {
      this.calisiyor = null;
    });
    return this.calisiyor;
  }

  private async dongu(): Promise<void> {
    while (this.bekleyen) {
      this.bekleyen = false;
      await this.tek();
    }
  }

  private async tek(): Promise<void> {
    const nesil = this.nesil;
    const gecikmeler = this.sec.gecikmeler ?? XP_GECIKMELERI;
    const bekle = this.sec.bekle ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const taban = this.son;
    for (const g of gecikmeler) {
      await bekle(g);
      if (nesil !== this.nesil) return;
      let d: MotivasyonDurumu;
      try {
        d = await this.sec.getir();
      } catch {
        continue; // gecici hata: sonraki denemede yeniden
      }
      if (nesil !== this.nesil) return;
      this.sec.kaydet?.(d);
      if (taban === null) {
        this.son = d; // ilk okuma: taban kuruldu, olay yok
        return;
      }
      const fark = xpFarki(taban, d);
      this.son = d;
      if (fark) {
        const olay: XpOlayi = { fark, durum: d };
        this.dinleyiciler.forEach((f) => {
          f(olay);
        });
        return;
      }
      if (this.bekleyen) return; // yeni eylem geldi: tabani koruyup yeniden basla
    }
  }
}
