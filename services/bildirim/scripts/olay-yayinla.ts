import { motivasyonSeriRiskV1 } from '@kopru/contracts';
import { connect, headers } from 'nats';

/**
 * Gelistirme/deneme araci: NATS'a (gercek servisler olmadan) test olayi yayimlar.
 *
 *   NATS_URL=nats://localhost:4231 pnpm --filter @kopru/bildirim exec tsx scripts/olay-yayinla.ts \
 *     seri-risk <kurum_id> <ogrenci_uyelik_id> <gun_bitis_at ISO> [mevcut_seri]
 *
 * Yalniz `seri-risk` desteklenir (motivasyon seri hatirlatmasi); `bildirim-akisi.sh` kullanir.
 */
const [tur, kurumId, ogrenciId, gunBitis, seri] = process.argv.slice(2);
if (tur !== 'seri-risk' || !kurumId || !ogrenciId || !gunBitis) {
  console.error(
    'Kullanım: olay-yayinla.ts seri-risk <kurum_id> <ogrenci_uyelik_id> <gun_bitis_at> [seri]',
  );
  process.exit(2);
}
const url = process.env.NATS_URL;
if (!url) throw new Error('NATS_URL tanımlı değil');

const olay = motivasyonSeriRiskV1.create({
  kurumId,
  actor: { tur: 'sistem', id: 'olay-yayinla' },
  correlationId: 'bildirim-akisi',
  data: {
    ogrenci_id: ogrenciId,
    mevcut_seri: Number(seri ?? '5'),
    gun_bitis_at: new Date(gunBitis).toISOString(),
    dondurma_stogu: 0,
  },
});
const nc = await connect({ servers: url, name: 'bildirim-olay-yayinla' });
const h = headers();
h.set('Nats-Msg-Id', olay.id);
await nc.jetstream().publish(motivasyonSeriRiskV1.subject, JSON.stringify(olay), { headers: h });
await nc.drain();
console.log(`yayımlandı: ${motivasyonSeriRiskV1.subject} ${olay.id}`);
