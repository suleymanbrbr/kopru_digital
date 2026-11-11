import { runWorker, startTelemetry } from '@kopru/service-kit';

import { loadServiceEnv, serviceName } from './config.js';
import { geceIsiZamanla } from './modules/finans/index.js';
import { kaynakSuresiniDoldur } from './sistem/ders-kaynak-sure-sonu.js';
import { dersSaatlikIs } from './sistem/ders-seri-uret.js';

const env = loadServiceEnv();
const telemetry = startTelemetry(`${serviceName}-worker`, env.OTEL_EXPORTER_OTLP_ENDPOINT);

/**
 * Ders saatlik isi (seri uzatma, katilimci esitleme, eski yoklama istegi temizligi, kaynak sure sonu): acilista ve sonra saatte bir denenir. Is idempotenttir ve yapilacak is yoksa hicbir
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
  // Isler `api_sistem` baglantisiyla (withSistem) calisir; DB yoksa zamanlanmaz.
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
        const ozet = await dersSaatlikIs(db, { log });
        if (ozet.seri.seri > 0 || ozet.seri.hata > 0) log.info(ozet.seri, 'ders serileri uzatıldı');
        if (ozet.katilimci.ders > 0 || ozet.katilimci.hata > 0) {
          log.info(ozet.katilimci, 'ders katılımcıları eşitlendi');
        }
        if (ozet.silinenYoklamaIstegi > 0) {
          log.info({ silinen: ozet.silinenYoklamaIstegi }, 'eski yoklama istekleri silindi');
        }
        // Ders kaydi/materyal son erisim tarihi gecenleri `suresi_doldu` yapar (idempotent, coklu worker guvenli).
        const sure = await kaynakSuresiniDoldur(db, { log });
        if (sure.kaynak > 0 || sure.hata > 0) log.info(sure, 'ders kaynaklarının süresi doldu');
      } catch (err) {
        log.error({ err }, 'ders saatlik işi başarısız');
      } finally {
        calisiyor = false;
      }
    };
    void calistir();
    const zamanlayici = setInterval(() => void calistir(), DERS_SERI_ARALIGI_MS);
    const finansIsleriniDurdur = geceIsiZamanla(db, log);
    return Promise.resolve(async () => {
      clearInterval(zamanlayici);
      await finansIsleriniDurdur();
    });
  },
  onClose: telemetry.shutdown,
});
