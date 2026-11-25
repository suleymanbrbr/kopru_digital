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

/**
 * Gelistirme: kodu loga yazar (`dev_telefon`/`dev_kod`; log redaksiyonu `telefon`/`kod` alanlarini maskeler,
 * bu yuzden gelistirme alanlari ayri adlidir). Uretimde (`uretim = true`) telefon, kod ve metin ASLA loga
 * yazilmaz: gercek saglayici yoksa gonderim atlanir ve yalniz bu bilgi loglanir.
 */
export class LogSmsGonderici implements SmsGonderici {
  constructor(
    private readonly log: Pick<FastifyBaseLogger, 'warn'>,
    private readonly uretim = false,
  ) {}

  gonder(mesaj: SmsMesaji): Promise<void> {
    if (this.uretim) {
      this.log.warn('[SMS] saglayici yapilandirilmadi: sms gonderimi atlandi (icerik loglanmaz)');
    } else {
      this.log.warn({ dev_telefon: mesaj.telefon, dev_kod: mesaj.kod }, `[DEV SMS] ${mesaj.metin}`);
    }
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
