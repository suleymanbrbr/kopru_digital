import type { FastifyBaseLogger } from 'fastify';

export interface SmsMesaji {
  /** E.164 */
  telefon: string;
  metin: string;
  /** Yalnizca gelistirme gunlugu icin: ham OTP kodu. Gercek saglayici bunu kullanmaz. */
  kod?: string;
}

/**
 * SMS gonderim arayuzu. Gercek Netgsm gonderimi `bildirim` servisine tasinacak
 * (ADR 0001/0002: gizli SMS gonderimi senkron ic cagridir); o zamana kadar log uygulamasi kullanilir.
 */
export interface SmsGonderici {
  gonder(mesaj: SmsMesaji): Promise<void>;
}

/** Gelistirme: kodu loga yazar. Uretimde kullanilmamalidir. */
export class LogSmsGonderici implements SmsGonderici {
  constructor(private readonly log: Pick<FastifyBaseLogger, 'warn'>) {}

  gonder(mesaj: SmsMesaji): Promise<void> {
    this.log.warn({ telefon: mesaj.telefon, kod: mesaj.kod }, `[DEV SMS] ${mesaj.metin}`);
    return Promise.resolve();
  }
}

/** Testler: gonderilen mesajlari toplar. */
export class YakalayanSmsGonderici implements SmsGonderici {
  readonly mesajlar: SmsMesaji[] = [];

  gonder(mesaj: SmsMesaji): Promise<void> {
    this.mesajlar.push(mesaj);
    return Promise.resolve();
  }

  sonKod(telefon: string): string | undefined {
    return this.mesajlar.findLast((m) => m.telefon === telefon)?.kod;
  }
}
