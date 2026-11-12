import { createDb, runWorker, startTelemetry } from '@kopru/service-kit';

import { loadServiceEnv, serviceName } from './config.js';
import { depolamaOlustur } from './depolama.js';
import { kuyrugunuIsle, type IslemeLogu } from './isleme/isle.js';
import { bakimTuru, gunlukTemizlik, kotaDenetimi } from './isler.js';
import { tuketicileriBaslat } from './tuketiciler.js';
import { periyodikIs, istanbulSaati } from './zamanlayici.js';

const env = loadServiceEnv();
const telemetry = startTelemetry(`${serviceName}-worker`, env.OTEL_EXPORTER_OTLP_ENDPOINT);
const depolama = depolamaOlustur(env);

const DAKIKA = 60_000;

// Ayri surec. Outbox relay ve isler `medya_sistem` (BYPASSRLS) baglantisiyla calisir (ADR 0003);
// olay tuketicileri `medya_app` (RLS'e tabi) ile `kiraci: 'olaydan'` calisir.
await runWorker({
  name: serviceName,
  env: { ...env, DATABASE_URL: env.DATABASE_SISTEM_URL ?? env.DATABASE_URL },
  outboxTable: 'ortak.outbox',
  setup: async ({ db, nats, log }) => {
    const temizleyiciler: (() => Promise<void>)[] = [];
    if (!db) {
      log.info('medya işleri devre dışı (veritabanı yok)');
      return undefined;
    }
    const islemeLogu: IslemeLogu = log;

    if (nats && env.DATABASE_URL) {
      const appDb = createDb({ url: env.DATABASE_URL, max: env.DATABASE_POOL_MAX });
      const tuketiciler = await tuketicileriBaslat({ nats, db: appDb, log });
      temizleyiciler.push(async () => {
        await Promise.all(tuketiciler.map((t) => t.stop()));
        await appDb.close();
      });
    }

    if (!depolama) {
      log.warn('S3_ENDPOINT tanımlı değil: dosya işleme ve silme işleri devre dışı');
    } else {
      const d = { db, depolama, log: islemeLogu };
      // Isleme kuyrugu: is varsa hemen devam eder, yoksa `ISLEME_ARALIK_MS` bekler.
      temizleyiciler.push(
        periyodikIs('isleme', env.ISLEME_ARALIK_MS, log, async () => {
          while ((await kuyrugunuIsle(d, env.ISLEME_ESZAMANLILIK)) > 0) {
            // kuyruk bosalana kadar
          }
        }),
      );
      // Silme, yukleme zaman asimi, yetim kurali, takilan isleme: varsayilan 5 dakikada bir.
      temizleyiciler.push(periyodikIs('bakim', env.BAKIM_ARALIK_MS, log, () => bakimTuru(d)));
      // Gece kota denetimi: Istanbul 03:00 saatinde (yarim saatlik kontrol, gunde bir kez).
      let sonGun = '';
      temizleyiciler.push(
        periyodikIs(
          'gece-kota',
          30 * DAKIKA,
          log,
          async () => {
            const { saat, gun } = istanbulSaati();
            if (saat !== 3 || gun === sonGun) return;
            sonGun = gun;
            await kotaDenetimi(d);
          },
          { hemenCalistirma: false },
        ),
      );
      temizleyiciler.push(
        periyodikIs(
          'gunluk-temizlik',
          60 * DAKIKA,
          log,
          async () => {
            const { saat } = istanbulSaati();
            if (saat !== 4) return;
            const silinen = await gunlukTemizlik(d);
            if (silinen > 0) log.info({ silinen }, 'eski processed_events silindi');
          },
          { hemenCalistirma: false },
        ),
      );
    }

    return async () => {
      for (const t of temizleyiciler.reverse()) await t();
      depolama?.kapat();
    };
  },
  onClose: telemetry.shutdown,
});
