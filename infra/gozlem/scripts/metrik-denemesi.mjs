// Gozlemlenebilirlik gercek denemesi: kucuk bir servis + sahte yuk uretir, metrikleri yerel otel-lgtm'ye
// (OTLP :4318) yollar. Panolar/alarmlar bu verilerle denenir.
//
// Kullanim (kokten, once `pnpm --filter @kopru/service-kit build`):
//   node infra/gozlem/scripts/metrik-denemesi.mjs [sure_sn=120] [port=41810]
// Ortam: PG_ADMIN_URL (varsayilan postgres://postgres:postgres@localhost:5433/postgres),
//        OTEL_EXPORTER_OTLP_ENDPOINT (varsayilan http://localhost:4318).
// Kendi gecici veritabanini (`d2_gozlem_deneme`) acar ve sonunda siler.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as bekle } from 'node:timers/promises';

const kok = resolve(import.meta.dirname, '../../..');
const kit = resolve(kok, 'packages/service-kit');
const require = createRequire(kit + '/package.json');
const {
  createService,
  startTelemetry,
  createDb,
  metrikler,
  startOutboxRelay,
  renderOutboxMigration,
} = await import(resolve(kit, 'dist/index.js'));
const { testEnv } = await import(resolve(kit, 'dist/test-support.js'));
const postgresModulu = await import(require.resolve('postgres'));
const postgres = postgresModulu.default;

const sureSn = Number(process.argv[2] ?? 120);
const port = Number(process.argv[3] ?? 41810);
const admin = process.env.PG_ADMIN_URL ?? 'postgres://postgres:postgres@localhost:5433/postgres';
const dbAd = 'd2_gozlem_deneme';
const dbUrl = admin.replace(/\/[^/]*$/, `/${dbAd}`);
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';
process.env.OTEL_METRIC_EXPORT_INTERVAL = '5000';

const yonetici = postgres(admin, { max: 1, onnotice: () => undefined });
await yonetici.unsafe(`drop database if exists ${dbAd}`);
await yonetici.unsafe(`create database ${dbAd}`);
const sema = postgres(dbUrl, { max: 1, onnotice: () => undefined });
await sema.unsafe(await renderOutboxMigration('public'));
await sema.unsafe(
  `insert into outbox (id, kurum_id, subject, payload, created_at)
   select gen_random_uuid(), gen_random_uuid(), 'evt.deneme.v1', '{}', now() - interval '90 seconds' from generate_series(1,5)`,
);
await sema.end();

const telemetri = startTelemetry('kopru-deneme', endpoint);
const env = testEnv({ DATABASE_URL: dbUrl, AUTH_ENABLED: 'false' });
const servis = createService({
  name: 'kopru-deneme',
  port,
  env,
  onClose: telemetri.shutdown,
  plugins: [
    (app) => {
      app.get('/v1/dersler/:id', async () => {
        await bekle(5 + Math.random() * 120);
        return { ok: true };
      });
      app.get('/v1/bozuk', () => {
        throw new Error('deneme hatasi');
      });
      return Promise.resolve();
    },
  ],
});
await servis.start();

// Teslim edilemeyen NATS: relay yayinlayamaz, outbox bekleyeni/yasi metrikte gorunur.
const db = createDb({ url: dbUrl, max: 3 });
metrikler.dbHavuzuIzle('sistem', db.sql);
const relay = startOutboxRelay({
  db,
  nats: { jetstream: () => ({ publish: () => Promise.reject(new Error('nats yok')) }) },
  intervalMs: 2000,
  metrikAraligiMs: 3000,
});

const bitis = Date.now() + sureSn * 1000;
let tur = 0;
while (Date.now() < bitis) {
  tur++;
  const kimlik = crypto.randomUUID();
  await fetch(`http://127.0.0.1:${port}/v1/dersler/${kimlik}`);
  if (tur % 5 === 0) await fetch(`http://127.0.0.1:${port}/v1/bozuk`);
  if (tur % 7 === 0) await fetch(`http://127.0.0.1:${port}/yok-${tur}`);
  await metrikler
    .isiOlc('deneme-is', async () => {
      if (tur % 4 === 0) throw new Error('is hatasi');
    })
    .catch(() => undefined);
  metrikler.tuketici('deneme.tuketici', tur % 6 === 0 ? 'hata' : 'basarili');
  if (tur % 20 === 0) metrikler.dlq('deneme.tuketici', 'teslim_siniri_asildi');
  if (tur % 10 === 0) metrikler.iptalKontrolAtlandi();
  metrikler.bildirimGonderim(tur % 3 === 0 ? 'basarisiz' : 'gonderildi', 1);
  if (tur % 30 === 0) metrikler.abonelikAlarm('cift_kanal');
  await bekle(300);
}

await relay.stop();
await db.close();
await servis.stop();
const son = postgres(admin, { max: 1 });
await son.unsafe(`drop database if exists ${dbAd}`);
await son.end();
await yonetici.end();
console.log('metrik denemesi bitti, istek turu:', tur);
