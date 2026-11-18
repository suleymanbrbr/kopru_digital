import { createDb, runWorker, startTelemetry } from '@kopru/service-kit';

import { bakimIsi } from './bakim.js';
import { loadServiceEnv, serviceName } from './config.js';
import { duyuruDagitimIsi } from './duyuru-isi.js';
import { gonderimIsle } from './gonderim.js';
import { OUTBOX_TABLOSU } from './ortak.js';
import { saglayiciSec } from './push/index.js';
import { sablonlariYukle } from './sablonlar.js';
import { tuketicileriBaslat } from './tuketiciler.js';
import { istanbulSaati, periyodikIs } from './zamanlayici.js';

const env = loadServiceEnv();
const telemetry = startTelemetry(`${serviceName}-worker`, env.OTEL_EXPORTER_OTLP_ENDPOINT);

// Ayri surec. Outbox relay ve isler `bildirim_sistem` (BYPASSRLS) baglantisiyla calisir (ADR 0003);
// olay tuketicileri `bildirim_app` (RLS'e tabi) ile `kiraci: 'olaydan'` calisir.
await runWorker({
  name: serviceName,
  env: { ...env, DATABASE_URL: env.DATABASE_SISTEM_URL ?? env.DATABASE_URL },
  outboxTable: OUTBOX_TABLOSU,
  setup: async ({ db, nats, log }) => {
    const temizleyiciler: (() => Promise<void>)[] = [];
    if (!db) {
      log.info('bildirim işleri devre dışı (veritabanı yok)');
      return undefined;
    }

    // Kodlu sablonlari tabloya esle (ayna; idempotent).
    const guncellenen = await db.orm.transaction((tx) => sablonlariYukle(tx));
    if (guncellenen > 0) log.info({ sablon: guncellenen }, 'bildirim şablonları güncellendi');

    if (nats && env.DATABASE_URL) {
      const appDb = createDb({ url: env.DATABASE_URL, max: env.DATABASE_POOL_MAX });
      const tuketiciler = await tuketicileriBaslat({ nats, db: appDb, log });
      temizleyiciler.push(async () => {
        await Promise.all(tuketiciler.map((t) => t.stop()));
        await appDb.close();
      });
    }

    // Push gonderimi: olaydan push'a p95 < 30 sn hedefi icin kisa aralik (varsayilan 5 sn).
    const saglayici = saglayiciSec(env, log);
    log.info({ saglayici: saglayici.ad, aralikMs: env.GONDERIM_ARALIK_MS }, 'push gönderim işi');
    temizleyiciler.push(
      periyodikIs('gonderim-isle', env.GONDERIM_ARALIK_MS, log, async () => {
        // Dolu paket kalmayana kadar (sinirli tur) arka arkaya isle.
        for (let tur = 0; tur < 20; tur++) {
          const o = await gonderimIsle({ db, saglayici });
          if (o.secilen > 0) log.info(o, 'gönderim işi');
          if (o.secilen < 100) break;
        }
      }),
    );

    // Gece bakimi (Istanbul 03:00): pasif cihaz, saklama silmeleri, processed_events.
    temizleyiciler.push(
      periyodikIs(
        'bakim',
        60 * 60_000,
        log,
        async () => {
          if (istanbulSaati().saat !== 3) return;
          const o = await bakimIsi({ db });
          log.info(o, 'bildirim bakım işi');
        },
        { hemenCalistirma: false },
      ),
    );

    // Duyuru dagitimi: buyuk hedeflerin kutu/push bildirimleri partiler halinde (RLS'li ayri havuz).
    if (env.DATABASE_URL) {
      const duyuruDb = createDb({ url: env.DATABASE_URL, max: 2 });
      // Temizleyiciler ters sirayla calisir: once is durur, sonra havuz kapanir.
      temizleyiciler.push(() => duyuruDb.close());
      temizleyiciler.push(
        periyodikIs('duyuru-dagit', 3000, log, async () => {
          for (let tur = 0; tur < 20; tur++) {
            const o = await duyuruDagitimIsi({ sistem: db, uygulama: duyuruDb });
            if (o.duyuru > 0) log.info(o, 'duyuru dağıtım işi');
            if (o.duyuru < 5) break;
          }
        }),
      );
    }

    return async () => {
      for (const t of temizleyiciler.reverse()) await t();
    };
  },
  onClose: telemetry.shutdown,
});
