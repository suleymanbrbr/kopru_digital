import { metrics, type Counter, type Histogram, type Meter } from '@opentelemetry/api';

/**
 * Tum servislerde ortak metrikler (ADR 0005 "Gozlemlenebilirlik").
 *
 * KART SAYISI (cardinality) KURALLARI — bunlar test ile zorlanir (`metrikler.test.ts`):
 * - Etiket anahtarlari yalnizca `IZINLI_ETIKETLER` icinden olabilir.
 * - Kurum, kullanici, kisi, istek kimligi, ham URL, e-posta, telefon ASLA etiket olmaz.
 * - Etiket degerleri sinirli kumelerdir: rota SABLONU (`/v1/dersler/:id`), durum SINIFI (`2xx`), sabit
 *   `sonuc`/`neden` sozlugu, kodda tanimli is/tuketici adlari.
 * - Servis adi OTel kaynak niteligidir (`service.name`), etiket olarak tekrar yazilmaz.
 */
export const IZINLI_ETIKETLER: ReadonlySet<string> = new Set([
  'yontem',
  'rota',
  'durum_sinifi',
  'tuketici',
  'sonuc',
  'neden',
  'is',
  'havuz',
  'tur',
]);

export type TuketiciSonucu = 'basarili' | 'tekrar' | 'yeniden_dene' | 'hata';
export type GonderimSonucu = 'gonderildi' | 'yeniden' | 'basarisiz' | 'atlandi';
/** `kopru_abonelik_alarm_toplam{tur}` sozlugu (loglardaki `*_alarm` satirlariyla bire bir). */
export type AbonelikAlarmTuru =
  | 'olay_isleme'
  | 'cift_kanal'
  | 'fatura'
  | 'fatura_bilgisi_yok'
  | 'webhook_imza'
  | 'webhook_isleme';

export interface OutboxDurumu {
  bekleyen: number;
  /** En eski bekleyen satirin yasi (saniye); bekleyen yoksa 0. */
  enEskiYasSn: number;
}

const HTTP_SURE_SINIRLARI = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const IS_SURE_SINIRLARI = [0.01, 0.05, 0.25, 1, 5, 15, 60, 300];

export class Metrikler {
  private httpSure!: Histogram;
  private http5xx!: Counter;
  private tuketiciIslenen!: Counter;
  private tuketiciDlq!: Counter;
  private isCalisma!: Counter;
  private isSure!: Histogram;
  private iptalAtlandi!: Counter;
  private bildirimGonderimi!: Counter;
  private abonelikAlarmi!: Counter;

  private outbox: OutboxDurumu | null = null;
  private readonly sonBasarili = new Map<string, number>();
  private readonly havuzlar = new Map<string, () => PoolDurumu>();

  constructor(
    meter: Meter,
    private readonly simdi: () => number = Date.now,
  ) {
    this.baglan(meter);
  }

  /**
   * Enstrumanlari verilen olcere (yeniden) baglar. OTel metrik API'sinde vekil (proxy) yoktur: SDK
   * kaydedilmeden olusturulan enstrumanlar no-op kalir. Bu yuzden varsayilan ornek `startTelemetry`
   * icinde, SDK basladiktan SONRA yeniden baglanir.
   */
  baglan(meter: Meter): void {
    this.httpSure = meter.createHistogram('kopru_http_istek_suresi', {
      description: 'HTTP istek suresi (rota sablonu, yontem, durum sinifi).',
      unit: 's',
      advice: { explicitBucketBoundaries: HTTP_SURE_SINIRLARI },
    });
    this.http5xx = meter.createCounter('kopru_http_5xx', {
      description: '5xx ile biten HTTP istekleri.',
    });
    this.tuketiciIslenen = meter.createCounter('kopru_tuketici_islenen', {
      description:
        'Olay tuketicisinin isledigi mesajlar (sonuc: basarili|tekrar|yeniden_dene|hata).',
    });
    this.tuketiciDlq = meter.createCounter('kopru_tuketici_dlq', {
      description: 'DLQ stream ine yazilan olaylar (neden sabit sozluktur).',
    });
    this.isCalisma = meter.createCounter('kopru_is_calisma', {
      description: 'Worker zamanlayici islerinin calismalari (sonuc: basarili|hata).',
    });
    this.isSure = meter.createHistogram('kopru_is_sure', {
      description: 'Worker zamanlayici isi suresi.',
      unit: 's',
      advice: { explicitBucketBoundaries: IS_SURE_SINIRLARI },
    });
    this.iptalAtlandi = meter.createCounter('kopru_iptal_kontrol_atlandi', {
      description: 'Iptal listesine ulasilamadi, kontrol atlandi (fail-open, ADR 0008).',
    });
    this.bildirimGonderimi = meter.createCounter('kopru_bildirim_gonderim', {
      description: 'Push gonderim sonuclari (sonuc: gonderildi|yeniden|basarisiz|atlandi).',
    });
    this.abonelikAlarmi = meter.createCounter('kopru_abonelik_alarm', {
      description: 'Odeme/abonelik alarm olaylari (tur: sabit sozluk).',
    });

    meter
      .createObservableGauge('kopru_outbox_bekleyen', {
        description: 'Gonderilmemis outbox satiri sayisi.',
      })
      .addCallback((sonuc) => {
        if (this.outbox) sonuc.observe(this.outbox.bekleyen);
      });
    meter
      .createObservableGauge('kopru_outbox_en_eski_yas', {
        description: 'En eski gonderilmemis outbox satirinin yasi.',
        unit: 's',
      })
      .addCallback((sonuc) => {
        if (this.outbox) sonuc.observe(this.outbox.enEskiYasSn);
      });
    meter
      .createObservableGauge('kopru_is_son_basarili_zaman', {
        description: 'Isin son basarili calismasinin unix zamani.',
        unit: 's',
      })
      .addCallback((sonuc) => {
        for (const [is, zaman] of this.sonBasarili) sonuc.observe(zaman, { is });
      });
    const havuzAlani = (ad: string, aciklama: string, sec: (d: PoolDurumu) => number) => {
      meter.createObservableGauge(ad, { description: aciklama }).addCallback((sonuc) => {
        for (const [havuz, oku] of this.havuzlar) sonuc.observe(sec(oku()), { havuz });
      });
    };
    havuzAlani('kopru_db_havuz_baglanti', 'Acik veritabani baglantisi.', (d) => d.connections);
    havuzAlani('kopru_db_havuz_kullanimda', 'Is yapan (odunc verilmis) baglanti.', (d) => d.leased);
    havuzAlani('kopru_db_havuz_bekleyen', 'Baglanti bekleyen sorgu.', (d) => d.waiting);
    havuzAlani('kopru_db_havuz_azami', 'Havuz ust siniri.', (d) => d.max);
  }

  /** Rota sablonu yoksa (404, tarayici taramasi) `bilinmeyen`: kart sayisini sabit tutar. */
  httpIstek(yontem: string, rota: string | undefined, durumKodu: number, sureSn: number): void {
    const siniflar = `${String(Math.floor(durumKodu / 100))}xx`;
    const etiket = {
      yontem: yontem.toUpperCase(),
      rota: rota && rota.length > 0 ? rota : 'bilinmeyen',
    };
    this.httpSure.record(sureSn, { ...etiket, durum_sinifi: siniflar });
    if (durumKodu >= 500) this.http5xx.add(1, etiket);
  }

  tuketici(tuketici: string, sonuc: TuketiciSonucu): void {
    this.tuketiciIslenen.add(1, { tuketici, sonuc });
  }

  dlq(tuketici: string, neden: string): void {
    this.tuketiciDlq.add(1, { tuketici, neden });
  }

  /** Bir zamanlayici is calismasini kaydeder; basarida son basarili zamani gunceller. */
  isCalisti(is: string, basarili: boolean, sureSn: number): void {
    this.isCalisma.add(1, { is, sonuc: basarili ? 'basarili' : 'hata' });
    this.isSure.record(sureSn, { is });
    if (basarili) this.sonBasarili.set(is, this.simdi() / 1000);
  }

  /**
   * `fn`'i olcer: hata firlatirsa `hata` sayar ve hatayi AYNEN yeniden firlatir. Hatayi yutan isler
   * (kendi try/catch'i olanlar) `isCalisti`yi kendileri cagirir.
   */
  async isiOlc<T>(is: string, fn: () => Promise<T>): Promise<T> {
    const basla = performance.now();
    try {
      const sonuc = await fn();
      this.isCalisti(is, true, (performance.now() - basla) / 1000);
      return sonuc;
    } catch (err) {
      this.isCalisti(is, false, (performance.now() - basla) / 1000);
      throw err;
    }
  }

  iptalKontrolAtlandi(): void {
    this.iptalAtlandi.add(1);
  }

  bildirimGonderim(sonuc: GonderimSonucu, adet = 1): void {
    if (adet > 0) this.bildirimGonderimi.add(adet, { sonuc });
  }

  abonelikAlarm(tur: AbonelikAlarmTuru): void {
    this.abonelikAlarmi.add(1, { tur });
  }

  outboxDurumuGuncelle(durum: OutboxDurumu): void {
    this.outbox = durum;
  }

  /** Veritabani havuzunu (`postgres.js` `sql.stats`) izlemeye alir; `havuz` kodda sabit bir ad olmali. */
  dbHavuzuIzle(
    havuz: string,
    kaynak: { stats: PoolStatistikleri; options: { max: number } },
  ): void {
    this.havuzlar.set(havuz, () => ({
      connections: kaynak.stats.connections,
      leased: kaynak.stats.leased,
      waiting: kaynak.stats.waiting,
      max: kaynak.options.max,
    }));
  }
}

export interface PoolStatistikleri {
  connections: number;
  leased: number;
  waiting: number;
}

interface PoolDurumu extends PoolStatistikleri {
  max: number;
}

/** Surec geneli varsayilan ornek: SDK `startTelemetry` ile baslamadiysa no-op olcer kullanir. */
export const metrikler = new Metrikler(metrics.getMeter('kopru'));
