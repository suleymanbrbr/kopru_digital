import type { FastifyBaseLogger } from 'fastify';

export interface EpostaMesaji {
  /** Alici adresi. Gunluge YAZILMAZ. */
  alici: string;
  konu: string;
  metin: string;
  /** Gunluge yazilabilen, kisisel veri icermeyen iliski kimligi (ornek: davet_id). */
  baglamId: string;
}

/**
 * E-posta gonderim arayuzu. Gercek gonderim `bildirim` servisine ait olacak; o zamana kadar log
 * uygulamasi kullanilir.
 */
export interface EpostaGonderici {
  gonder(mesaj: EpostaMesaji): Promise<void>;
}

/** Gelistirme: yalnizca iliski kimligini loga yazar (alici adresi ve metin KVKK geregi yazilmaz). */
export class LogEpostaGonderici implements EpostaGonderici {
  constructor(private readonly log: Pick<FastifyBaseLogger, 'warn'>) {}

  gonder(mesaj: EpostaMesaji): Promise<void> {
    this.log.warn({ baglam_id: mesaj.baglamId }, '[DEV EPOSTA] e-posta gönderimi atlandı (log)');
    return Promise.resolve();
  }
}

/** Testler: gonderilen mesajlari toplar. */
export class YakalayanEpostaGonderici implements EpostaGonderici {
  readonly mesajlar: EpostaMesaji[] = [];

  gonder(mesaj: EpostaMesaji): Promise<void> {
    this.mesajlar.push(mesaj);
    return Promise.resolve();
  }
}
