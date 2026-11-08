import { runWorker, startTelemetry } from '@kopru/service-kit';

import { loadServiceEnv, serviceName } from './config.js';
import { dersSerileriniUret } from './sistem/ders-seri-uret.js';

const env = loadServiceEnv();
const telemetry = startTelemetry(`${serviceName}-worker`, env.OTEL_EXPORTER_OTLP_ENDPOINT);

/**
 * Ders serisi uretimi: acilista ve sonra saatte bir denenir. Is idempotenttir ve yapilacak is yoksa hicbir
 * sey yazmaz (bkz. `dersSerileriniUret`); boylece her seri gunde bir kez uzar, worker yeniden basladiysa ya da
 * bir calisma basarisiz olduysa bir saat icinde toparlanir. Zamanlayici (pg-boss) geldiginde bu cagri onun
 * gunluk isine tasinir.
 */
const DERS_SERI_ARALIGI_MS = 60 * 60 * 1000;

// Ayri surec: isler / olay tuketicileri buraya `setup` ile eklenir.
// Outbox relay satirlari guncelledigi/sildigi icin `api_sistem` baglantisini kullanir (ADR 0003);
// `api_app` outbox'a yalnizca ekleme yapar.
await runWorker({
  name: serviceName,
  env: { ...env, DATABASE_URL: env.DATABASE_SISTEM_URL ?? env.DATABASE_URL },
  outboxTable: 'ortak.outbox',
  setup: ({ db, log }) => {
    if (!db) {
      log.info('ders serisi işi devre dışı (veritabanı yok)');
      return Promise.resolve(undefined);
    }
    let calisiyor = false;
    const calistir = async () => {
      if (calisiyor) return;
      calisiyor = true;
      try {
        const ozet = await dersSerileriniUret(db, { log });
        if (ozet.seri > 0 || ozet.hata > 0) log.info(ozet, 'ders serileri uzatıldı');
      } catch (err) {
        log.error({ err }, 'ders serisi işi başarısız');
      } finally {
        calisiyor = false;
      }
    };
    void calistir();
    const zamanlayici = setInterval(() => void calistir(), DERS_SERI_ARALIGI_MS);
    return Promise.resolve(() => {
      clearInterval(zamanlayici);
      return Promise.resolve();
    });
  },
  onClose: telemetry.shutdown,
});
