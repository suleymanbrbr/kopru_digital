import { connect, type NatsConnection } from 'nats';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BellekIptalDeposu, IPTAL_KAYIT_OMRU_MS, IPTAL_KOVASI, NatsIptalDeposu } from './iptal.js';

describe('BellekIptalDeposu', () => {
  it('iptal edilen sid sorulunca true, baskasi false', async () => {
    const depo = new BellekIptalDeposu();
    await depo.iptalEt('sid-a');
    expect(await depo.iptalEdildiMi('sid-a')).toBe(true);
    expect(await depo.iptalEdildiMi('sid-b')).toBe(false);
  });

  it('kayitlar TTL sonunda temizlenir, depo sonsuza buyumez', async () => {
    let simdi = 1_000_000;
    const depo = new BellekIptalDeposu(1000, () => simdi);
    for (let i = 0; i < 50; i++) await depo.iptalEt(`sid-${String(i)}`);
    expect(depo.boyut).toBe(50);
    simdi += 1001;
    expect(await depo.iptalEdildiMi('sid-1')).toBe(false);
    expect(depo.boyut).toBe(0);
  });
});

describe('NatsIptalDeposu', () => {
  it('NATS yoksa okuma fail-open (false), yazma hata verir', async () => {
    const uyarilar: unknown[] = [];
    const depo = new NatsIptalDeposu(() => null, {
      log: { warn: (...a: unknown[]) => uyarilar.push(a), error: () => undefined },
    });
    expect(await depo.iptalEdildiMi('x')).toBe(false);
    expect(uyarilar).toHaveLength(1);
    await expect(depo.iptalEt('x')).rejects.toThrow();
  });
});

const natsUrl = process.env.NATS_URL;
describe.skipIf(!natsUrl)('NatsIptalDeposu (gercek NATS KV)', () => {
  let a: NatsConnection;
  let b: NatsConnection;
  beforeAll(async () => {
    a = await connect({ servers: natsUrl });
    b = await connect({ servers: natsUrl });
  });
  afterAll(async () => {
    await a.drain();
    await b.drain();
  });

  it('bir servisin yazdigi iptali baska bir baglanti (servis) hemen gorur', async () => {
    const yazan = new NatsIptalDeposu(() => a);
    const okuyan = new NatsIptalDeposu(() => b);
    const sid = `test-${String(Date.now())}`;
    expect(await okuyan.iptalEdildiMi(sid)).toBe(false);
    await yazan.iptalEt(sid);
    expect(await okuyan.iptalEdildiMi(sid)).toBe(true);
    expect(await okuyan.iptalEdildiMi(`${sid}-baska`)).toBe(false);
  });

  it('kova TTL ile olusur: kayitlar belirtec omru + pay sonunda NATS tarafindan silinir', async () => {
    await new NatsIptalDeposu(() => a).iptalEt(`ttl-${String(Date.now())}`);
    const kv = await a.jetstream().views.kv(IPTAL_KOVASI);
    const durum = await kv.status();

    expect(durum.ttl).toBe(IPTAL_KAYIT_OMRU_MS);
  });
});
