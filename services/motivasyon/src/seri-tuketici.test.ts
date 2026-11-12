import { createDb, ensureEventStream, type Database } from '@kopru/service-kit';
import { connect, headers, type NatsConnection } from 'nats';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { olay, ortamKur, yeniSenaryo, type Ortam } from './test/ortam.js';
import { natsYok, testDb, testNats } from './test/yardimcilar.js';
import { tuketicileriBaslat } from './tuketiciler.js';

const sessiz = { info: () => undefined, warn: () => undefined, error: () => undefined };

async function bekle<T>(oku: () => Promise<T | undefined | false>, ms = 15_000): Promise<T> {
  const bitis = Date.now() + ms;
  for (;;) {
    const v = await oku();
    if (v) return v;
    if (Date.now() > bitis) throw new Error('beklenen durum olusmadi');
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe.skipIf(natsYok())('seri: olay tuketicisi uctan uca (gercek PostgreSQL + NATS)', () => {
  const urls = testDb();
  const sonek = `_s${Math.random().toString(36).slice(2, 8)}`;
  let nats: NatsConnection;
  let o: Ortam;
  let app: Database;
  let durdur: () => Promise<void>;

  beforeAll(async () => {
    const url = testNats();
    if (!urls || !url) return;
    o = ortamKur();
    app = createDb({ url: urls.appUrl, max: 4 });
    nats = await connect({ servers: url, name: 'motivasyon-seri-test' });
    await ensureEventStream(nats);
    const tuketiciler = await tuketicileriBaslat({
      nats,
      db: app,
      log: sessiz,
      sonek,
      baslangic: 'yeni',
    });
    durdur = async () => {
      await Promise.all(tuketiciler.map((t) => t.stop()));
    };
  });

  afterAll(async () => {
    await durdur();
    const jsm = await nats.jetstreamManager();
    for (const ad of [`motivasyon_kopya${sonek}`, `motivasyon_xp${sonek}`]) {
      await jsm.consumers.delete('EVENTS', ad).catch(() => undefined);
    }
    await nats.drain();
    await app.close();
    await o.kapat();
  });

  it('3 ardisik gunun plan gorevi olaylari NATS uzerinden: seri 3, kilometre tasi olayi bir kez (olay iki kez gelse de)', async () => {
    const s = yeniSenaryo();
    const gun = (n: number) => new Date(`2026-11-1${n}T12:00:00+03:00`);
    for (const n of [0, 1, 2]) {
      const e = olay.plan(s, { at: gun(n), gorevId: uuidv7(), durum: 'tamam' });
      for (let i = 0; i < 2; i++) {
        const h = headers();
        h.set('Nats-Msg-Id', uuidv7());
        await nats
          .jetstream()
          .publish(`evt.${e.type}.v${String(e.version)}`, JSON.stringify(e), { headers: h });
      }
    }
    const seri = await bekle(async () => {
      const [r] = await o.sistem<{ mevcut_seri: number; en_uzun_seri: number }[]>`
        select mevcut_seri, en_uzun_seri from motivasyon.seriler where ogrenci_id = ${s.ogrenciId}`;
      return r?.mevcut_seri === 3 ? r : undefined;
    });
    expect(seri).toEqual({ mevcut_seri: 3, en_uzun_seri: 3 });
    const km = await o.sistem<{ data: { seri: number } }[]>`
      select payload->'data' as data from ortak.outbox
       where kurum_id = ${s.kurumId} and subject = 'evt.motivasyon.seri.kilometre_tasi.v1'`;
    expect(km.map((x) => x.data.seri)).toEqual([3]);
    const [a] = await o.sistem<{ n: number }[]>`
      select count(*)::int n from motivasyon.seri_gunleri where ogrenci_id = ${s.ogrenciId} and durum = 'aktif'`;
    expect(a?.n).toBe(3);
  });
});
