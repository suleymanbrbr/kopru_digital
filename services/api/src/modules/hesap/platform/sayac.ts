const DAKIKA_MS = 60_000;

export interface HataOrani {
  istek: number;
  hata5xx: number;
  oran: number;
}

/**
 * Surec ici HTTP sayaci: son `pencereDk` dakikanin istek ve 5xx sayisi (dakikalik kovalar). Yalniz bu api
 * surecinin gordugu istekleri sayar (coklu kopya varsa her kopya kendi sayacini raporlar); kalici metrik
 * degildir, OpenTelemetry metrikleri gelene kadar platform ekraninin hizli gostergesidir.
 */
export class HataSayaci {
  private readonly kovalar = new Map<number, { istek: number; hata: number }>();

  constructor(
    readonly pencereDk = 60,
    private readonly simdi: () => number = Date.now,
  ) {}

  kaydet(durumKodu: number): void {
    const dakika = Math.floor(this.simdi() / DAKIKA_MS);
    const kova = this.kovalar.get(dakika) ?? { istek: 0, hata: 0 };
    kova.istek += 1;
    if (durumKodu >= 500) kova.hata += 1;
    this.kovalar.set(dakika, kova);
    this.temizle(dakika);
  }

  ozet(): HataOrani {
    const simdi = Math.floor(this.simdi() / DAKIKA_MS);
    let istek = 0;
    let hata5xx = 0;
    for (const [dakika, kova] of this.kovalar) {
      if (dakika > simdi - this.pencereDk) {
        istek += kova.istek;
        hata5xx += kova.hata;
      }
    }
    return { istek, hata5xx, oran: istek === 0 ? 0 : hata5xx / istek };
  }

  private temizle(simdi: number): void {
    for (const dakika of this.kovalar.keys()) {
      if (dakika <= simdi - this.pencereDk) this.kovalar.delete(dakika);
    }
  }
}
