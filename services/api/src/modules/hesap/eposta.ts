import type { FastifyBaseLogger } from 'fastify';
import { createTransport, type Transporter } from 'nodemailer';

import type { Env } from '../../config.js';

export interface EpostaMesaji {
  /** Alici adresi. Gunluge YAZILMAZ. */
  alici: string;
  konu: string;
  metin: string;
  /** Gunluge yazilabilen, kisisel veri icermeyen iliski kimligi (ornek: davet_id). */
  baglamId: string;
}

/**
 * E-posta gonderim arayuzu. Gercek (uretim) gonderim `bildirim` servisine tasinacak (ADR 0001/0002);
 * o zamana kadar log ve SMTP uygulamalari api icinde kalir (yerelde Mailpit).
 */
export interface EpostaGonderici {
  gonder(mesaj: EpostaMesaji): Promise<void>;
  /** Baglanti havuzu varsa kapanista serbest birakilir. */
  close?(): void;
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

/**
 * SMTP uygulamasi (nodemailer). Yerelde Mailpit (localhost:1025). Alici ve metin loga YAZILMAZ;
 * yalnizca `baglamId` loglanir.
 */
export class SmtpEpostaGonderici implements EpostaGonderici {
  private readonly tasiyici: Transporter;

  constructor(
    private readonly env: Pick<
      Env,
      'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_USER' | 'SMTP_PASS' | 'SMTP_SECURE' | 'EPOSTA_GONDEREN'
    >,
  ) {
    this.tasiyici = createTransport({
      host: env.SMTP_HOST ?? 'localhost',
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER && env.SMTP_PASS
        ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }
        : {}),
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10_000,
    });
  }

  async gonder(mesaj: EpostaMesaji): Promise<void> {
    await this.tasiyici.sendMail({
      from: this.env.EPOSTA_GONDEREN,
      to: mesaj.alici,
      subject: mesaj.konu,
      text: mesaj.metin,
    });
  }

  close(): void {
    this.tasiyici.close();
  }
}

/** Ortam ayarina gore gonderici secer. */
export function epostaGondericiOlustur(
  env: Env,
  log: Pick<FastifyBaseLogger, 'warn'>,
): EpostaGonderici {
  return env.EPOSTA_SAGLAYICI === 'smtp'
    ? new SmtpEpostaGonderici(env)
    : new LogEpostaGonderici(log);
}
