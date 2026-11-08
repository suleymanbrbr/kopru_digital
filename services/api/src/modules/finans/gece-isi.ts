import type { Database } from '@kopru/service-kit';

import { geceIsleriniCalistir, type GeceIsiGunlugu } from '../../sistem/finans-gece-isleri.js';
import { bugunIstanbul } from './ortak.js';

const SAAT_MS = 3_600_000;

/**
 * Worker sureci icin zamanlayici: her saat kontrol eder, Europe/Istanbul 03:00 saatinde gunde bir kez
 * calistirir. pg-boss henuz depoda yoktur (kendi `pgboss` semasi migration ister); ayni arayuzle
 * ona tasinabilir. Birden cok worker ayni anda calisirsa isler idempotent oldugu icin zarar vermez.
 */
export function geceIsiZamanla(
  db: Pick<Database, 'orm'>,
  log: GeceIsiGunlugu,
  simdi: () => Date = () => new Date(),
): () => Promise<void> {
  let sonCalisma: string | null = null;
  const kontrol = () => {
    const an = simdi();
    const saat = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Istanbul',
        hour: '2-digit',
        hour12: false,
      }).format(an),
    );
    const gun = bugunIstanbul(an);
    if (saat !== 3 || sonCalisma === gun) return;
    sonCalisma = gun;
    geceIsleriniCalistir(db, log, gun).catch((err: unknown) => {
      log.error({ err: String(err) }, 'finans_gece_isi_hatasi');
      sonCalisma = null;
    });
  };
  const zamanlayici = setInterval(kontrol, SAAT_MS);
  zamanlayici.unref();
  return () => {
    clearInterval(zamanlayici);
    return Promise.resolve();
  };
}
