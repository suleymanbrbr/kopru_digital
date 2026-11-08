import type { FastifyBaseLogger } from 'fastify';
import type { KV, NatsConnection } from 'nats';

/** Erisim belirteci omru (api `ERISIM_BELIRTECI_OMRU_SN`) + saat sapmasi payi. KV kaydi bu sure sonra silinir. */
export const IPTAL_KAYIT_OMRU_MS = (15 * 60 + 60) * 1000;
/** NATS KV kovasi adi (ADR 0008). Anahtar = `sid`. */
export const IPTAL_KOVASI = 'iptal';

/**
 * Iptal edilmis oturum (`sid`) listesi (ADR 0008). Her servis ayni arayuzu kullanir:
 * kimlik dogrulamada (`installAuth`) `iptalEdildiMi` sorulur, api cikis/oturum iptalinde `iptalEt` yazar.
 */
export interface IptalDeposu {
  iptalEdildiMi(sid: string): Promise<boolean>;
  /** `sid`'i `IPTAL_KAYIT_OMRU_MS` boyunca iptal listesine koyar. */
  iptalEt(sid: string): Promise<void>;
}

/** Surec ici depo: NATS olmayan ortamlar ve testler. Girdiler TTL ile temizlenir. */
export class BellekIptalDeposu implements IptalDeposu {
  private readonly kayitlar = new Map<string, number>();

  constructor(
    private readonly omurMs = IPTAL_KAYIT_OMRU_MS,
    private readonly simdi: () => number = Date.now,
  ) {}

  get boyut(): number {
    this.temizle();
    return this.kayitlar.size;
  }

  iptalEdildiMi(sid: string): Promise<boolean> {
    const bitis = this.kayitlar.get(sid);
    if (bitis === undefined) return Promise.resolve(false);
    if (bitis <= this.simdi()) {
      this.kayitlar.delete(sid);
      return Promise.resolve(false);
    }
    return Promise.resolve(true);
  }

  iptalEt(sid: string): Promise<void> {
    this.temizle();
    this.kayitlar.set(sid, this.simdi() + this.omurMs);
    return Promise.resolve();
  }

  private temizle(): void {
    const simdi = this.simdi();
    for (const [sid, bitis] of this.kayitlar) {
      if (bitis <= simdi) this.kayitlar.delete(sid);
    }
  }
}

export interface NatsIptalSecenekleri {
  log?: Pick<FastifyBaseLogger, 'warn' | 'error'>;
  /** Tek okuma icin bekleme siniri (ms). Asilirsa fail-open. */
  okumaZamanAsimiMs?: number;
  /** Hata sonrasi bu sure boyunca KV'ye sorulmaz (istek gecikmesini onler). */
  hataSonrasiAtlaMs?: number;
  omurMs?: number;
}

/**
 * NATS KV (`kv.iptal`) uygulamasi. Okuma hatasi/zaman asimi **fail-open**: belirtec zaten imzali ve
 * en cok 15 dk gecerlidir (ADR 0008). Yazma hatasi cagirana firlatilir.
 */
export class NatsIptalDeposu implements IptalDeposu {
  private kv: Promise<KV> | undefined;
  private atlaBitis = 0;
  /** Gorulen iptaller (iptal geri alinmaz); KV'ye tekrar sormamak icin. */
  private readonly bilinen = new Map<string, number>();
  private readonly zamanAsimi: number;
  private readonly atla: number;
  private readonly omur: number;

  constructor(
    private readonly nats: () => NatsConnection | null,
    private readonly secenekler: NatsIptalSecenekleri = {},
  ) {
    this.zamanAsimi = secenekler.okumaZamanAsimiMs ?? 300;
    this.atla = secenekler.hataSonrasiAtlaMs ?? 5000;
    this.omur = secenekler.omurMs ?? IPTAL_KAYIT_OMRU_MS;
  }

  private kovaAc(): Promise<KV> {
    const acilan = (this.kv ??= (async () => {
      const baglanti = this.nats();
      if (!baglanti || baglanti.isClosed()) throw new Error('NATS bağlantısı yok');
      return baglanti.jetstream().views.kv(IPTAL_KOVASI, { ttl: this.omur, history: 1 });
    })());
    acilan.catch(() => {
      if (this.kv === acilan) this.kv = undefined;
    });
    return acilan;
  }

  /** Suresi dolan girdileri ekleme sirasinda temizler; harita uzun omurlu surecte sinirsiz buyumez. */
  private bilineneEkle(sid: string, simdi: number): void {
    for (const [anahtar, bitis] of this.bilinen) {
      if (bitis <= simdi) this.bilinen.delete(anahtar);
    }
    this.bilinen.set(sid, simdi + this.omur);
  }

  async iptalEdildiMi(sid: string): Promise<boolean> {
    const simdi = Date.now();
    const bitis = this.bilinen.get(sid);
    if (bitis !== undefined) {
      if (bitis > simdi) return true;
      this.bilinen.delete(sid);
    }
    if (simdi < this.atlaBitis) return false;
    let zamanlayici: NodeJS.Timeout | undefined;
    try {
      const sonuc = await Promise.race([
        this.kovaAc().then((kv) => kv.get(sid)),
        new Promise<never>((_, reddet) => {
          zamanlayici = setTimeout(() => {
            reddet(new Error('iptal listesi zaman aşımı'));
          }, this.zamanAsimi);
        }),
      ]);
      const iptal = sonuc !== null && sonuc.operation === 'PUT';
      if (iptal) this.bilineneEkle(sid, simdi);
      return iptal;
    } catch (err) {
      this.atlaBitis = simdi + this.atla;
      this.secenekler.log?.warn(
        { err },
        'iptal listesine ulaşılamadı: kontrol atlandı (fail-open, ADR 0008)',
      );
      return false;
    } finally {
      clearTimeout(zamanlayici);
    }
  }

  async iptalEt(sid: string): Promise<void> {
    const kv = await this.kovaAc();
    await kv.put(sid, '1');
    this.bilineneEkle(sid, Date.now());
  }
}
