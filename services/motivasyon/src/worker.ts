import { createDb, runWorker, startTelemetry } from '@kopru/service-kit';

import { loadServiceEnv, serviceName } from './config.js';
import { gunlukTemizlik, haftalikSifirla } from './isler.js';
import { seriGeceIsi, seriRiskIsi } from './seri-isleri.js';
import { tuketicileriBaslat } from './tuketiciler.js';
import { istanbulSaati, periyodikIs } from './zamanlayici.js';

const env = loadServiceEnv();
const telemetry = startTelemetry(`${serviceName}-worker`, env.OTEL_EXPORTER_OTLP_ENDPOINT);

const DAKIKA = 60_000;

// Ayri surec. Outbox relay ve isler `motivasyon_sistem` (BYPASSRLS) baglantisiyla calisir (ADR 0003);
// olay tuketicileri `motivasyon_app` (RLS'e tabi) ile `kiraci: 'olaydan'` calisir.
await runWorker({
  name: serviceName,
  env: { ...env, DATABASE_URL: env.DATABASE_SISTEM_URL ?? env.DATABASE_URL },
  outboxTable: 'ortak.outbox',
  setup: async ({ db, nats, log }) => {
    const temizleyiciler: (() => Promise<void>)[] = [];
    if (!db) {
      log.info('motivasyon işleri devre dışı (veritabanı yok)');
      return undefined;
    }

    if (nats && env.DATABASE_URL) {
      const appDb = createDb({ url: env.DATABASE_URL, max: env.DATABASE_POOL_MAX });
      const tuketiciler = await tuketicileriBaslat({ nats, db: appDb, log });
      temizleyiciler.push(async () => {
        await Promise.all(tuketiciler.map((t) => t.stop()));
        await appDb.close();
      });
    }

    // Haftalik bu_hafta_xp sifirlama: her kurumun Pazartesi 04:00'ini gecince; idempotent, sik kontrol.
    temizleyiciler.push(
      periyodikIs('haftalik-sifirlama', env.HAFTALIK_ARALIK_MS, log, async () => {
        const n = await haftalikSifirla({ db });
        if (n > 0) log.info({ satir: n }, 'bu_hafta_xp sıfırlandı');
      }),
    );
    // Seri: gece degerlendirmesi (her kurumun 04:10'u) ve risk olayi (varsayilan 20:00). Sik kontrol,
    // idempotent, coklu worker guvenli (ogrenci kilidi).
    temizleyiciler.push(
      periyodikIs('seri-gece', 5 * DAKIKA, log, async () => {
        const s = await seriGeceIsi({ db });
        if (s.ogrenci > 0) log.info(s, 'seri gece işi');
      }),
    );
    temizleyiciler.push(
      periyodikIs('seri-risk', 5 * DAKIKA, log, async () => {
        const n = await seriRiskIsi({ db });
        if (n > 0) log.info({ olay: n }, 'seri risk olayları yazıldı');
      }),
    );
    temizleyiciler.push(
      periyodikIs(
        'gunluk-temizlik',
        60 * DAKIKA,
        log,
        async () => {
          if (istanbulSaati().saat !== 4) return;
          const silinen = await gunlukTemizlik({ db });
          if (silinen > 0) log.info({ silinen }, 'eski processed_events silindi');
        },
        { hemenCalistirma: false },
      ),
    );

    return async () => {
      for (const t of temizleyiciler.reverse()) await t();
    };
  },
  onClose: telemetry.shutdown,
});
