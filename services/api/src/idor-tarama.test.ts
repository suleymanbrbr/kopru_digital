import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { buildService } from './app.js';
import { loadServiceEnv } from './config.js';
import { YakalayanSmsGonderici } from './modules/hesap/index.js';
import { dersYardimcilari, type Kurulum } from './test/ders-yardimcilar.js';
import { bearer, dbYok, testDb, type KurumluKullanici } from './test/yardimcilar.js';

interface Rota {
  method: string;
  url: string;
  config: Record<string, unknown>;
}

/**
 * Kiracilar arasi erisim (IDOR) taramasi: rota envanterinden uretilir. Iki kurum tohumlanir; kurum A sahip
 * belirteciyle (1) URL'deki `kurum_id` yerine B'nin kurumu, (2) A'nin kendi kurumu ama diger yol
 * parametrelerinde B'nin kayit kimlikleri denenir. Beklenen: 403/404/400/409/422 (ya da bos 200); hicbir
 * yanit 5xx olmamali ve B'ye ait kimlik iceren 2xx govde donmemeli.
 * Sinir: govde dogrulamasi yetkiden once calistigi icin bos govdeli POST/PATCH'lerin bir kismi 400/422 ile
 * donebilir; bu uclarin ozel testleri (`*-rls.test.ts`, `*-api.test.ts`) ayri.
 */
describe.skipIf(dbYok())('guvenlik: kiracilar arasi erisim (IDOR) taramasi', () => {
  const urls = testDb();
  if (!urls) throw new Error('testDb yok');
  const sms = new YakalayanSmsGonderici();
  const service = buildService(
    loadServiceEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: urls.appUrl,
      DATABASE_SISTEM_URL: urls.sistemUrl,
      PUBLIC_URL: 'http://api.test',
      WEB_URL: 'http://web.test',
      RATE_LIMIT_MAX: '1000000',
    }),
    { sms },
  );
  const { app } = service;
  const rotalar: Rota[] = [];
  app.addHook('onRoute', (r) => {
    const yontemler = Array.isArray(r.method) ? r.method : [r.method];
    for (const method of yontemler) {
      if (method === 'HEAD' || method === 'OPTIONS') continue;
      rotalar.push({ method, url: r.url, config: (r.config ?? {}) as Record<string, unknown> });
    }
  });

  const sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
  afterAll(async () => {
    await sistem.end();
    await service.stop();
  });

  const y = dersYardimcilari({ t: { service, sms }, sistem });
  let a: KurumluKullanici;
  let b: Kurulum;
  /** B kurumunun tablolardaki kayit kimlikleri (tablo adi -> kimlikler). */
  const bKimlikleri = new Map<string, string[]>();
  const tumBKimlikleri = new Set<string>();

  beforeAll(async () => {
    await app.ready();
    a = await y.kurumluKullanici();
    b = await y.kur({ ogrenciSayisi: 3 });
    const ders = await y.dersAc(b);
    await y.seriAc(b, { baslangic_saati: '18:00' });
    await y.paketSat(b, b.ogrenciler[0] ?? '');
    tumBKimlikleri.add(ders.id);

    const tablolar = await sistem<{ s: string; t: string }[]>`
      select c.table_schema as s, c.table_name as t
      from information_schema.columns c
      join information_schema.columns k
        on k.table_schema = c.table_schema and k.table_name = c.table_name and k.column_name = 'kurum_id'
      where c.column_name = 'id' and c.data_type = 'uuid'
        and c.table_schema not in ('pg_catalog', 'information_schema')`;
    for (const { s, t } of tablolar) {
      const satirlar = await sistem<{ id: string }[]>`
        select id from ${sistem(s)}.${sistem(t)} where kurum_id = ${b.k.kurumId} limit 40`;
      if (satirlar.length === 0) continue;
      bKimlikleri.set(t, satirlar.map((r) => r.id));
      for (const r of satirlar) tumBKimlikleri.add(r.id);
    }
    tumBKimlikleri.add(b.k.kurumId);
    for (const o of b.ogrenciler) tumBKimlikleri.add(o);
  }, 120_000);

  const SAHTE = '00000000-0000-7000-8000-000000000001';

  /** Parametre adina gore B kimlikleri: ad `grup_id` -> adinda `grup` gecen tablolar; eslesme yoksa hepsi. */
  function adaylar(param: string): string[] {
    const kok = param.replace(/_id$/, '').replace(/s$/, '');
    const eslesen: string[] = [];
    for (const [tablo, idler] of bKimlikleri) {
      if (kok.length > 2 && tablo.includes(kok.slice(0, Math.min(kok.length, 5)))) eslesen.push(...idler);
    }
    const liste = eslesen.length > 0 ? eslesen : [...tumBKimlikleri];
    return [...new Set(liste)].slice(0, 12);
  }

  const govdeVar = (m: string) => m !== 'GET' && m !== 'DELETE';

  async function dene(
    r: Rota,
    token: string,
    degerler: Record<string, string>,
  ): Promise<{ durum: number; govde: string; url: string }> {
    const url = r.url.replace(/:([a-z_]+)/g, (_m, p: string) => degerler[p] ?? SAHTE);
    const yanit = await app.inject({
      method: r.method as 'GET',
      url,
      headers: { ...bearer(token), 'idempotency-key': uuidv7() },
      ...(govdeVar(r.method) ? { payload: {} } : {}),
    });
    return { durum: yanit.statusCode, govde: yanit.body, url };
  }

  const kiraciRotalari = () =>
    rotalar.filter(
      (r) =>
        r.config.public !== true &&
        r.config.servisScope === undefined &&
        !r.url.startsWith('/platform/') &&
        r.url.includes('/kurumlar/:kurum_id'),
    );

  it('URL\'deki baska kurum kimligi: A belirteci B kurumunun hicbir ucuna erisemez (403)', async () => {
    const rs = kiraciRotalari();
    expect(rs.length).toBeGreaterThan(100);
    const sorunlar: string[] = [];
    let kapali = 0;
    for (const r of rs) {
      const { durum, url } = await dene(r, a.token, { kurum_id: b.k.kurumId });
      // 400/422: sema dogrulamasi yetki kancasindan once calisir (bos govde); veriye dokunulmadi.
      if (durum === 403) kapali++;
      else if (durum !== 400 && durum !== 422) sorunlar.push(`${r.method} ${url} -> ${String(durum)}`);
    }
    expect(sorunlar).toEqual([]);
    expect(kapali).toBeGreaterThan(rs.length / 2);
  }, 300_000);

  it("kendi kurumu + B'nin kayit kimlikleri: sizinti ve 5xx yok", async () => {
    const sorunlar: string[] = [];
    let denenen = 0;
    for (const r of kiraciRotalari()) {
      const parametreler = [...r.url.matchAll(/:([a-z_]+)/g)]
        .map((m) => m[1] ?? '')
        .filter((p) => p !== 'kurum_id');
      if (parametreler.length === 0) continue;
      const havuz = new Set<string>();
      for (const p of parametreler) for (const id of adaylar(p)) havuz.add(id);
      for (const id of havuz) {
        const degerler: Record<string, string> = { kurum_id: a.kurumId };
        for (const p of parametreler) degerler[p] = id;
        const { durum, govde, url } = await dene(r, a.token, degerler);
        denenen++;
        if (durum >= 500) sorunlar.push(`${r.method} ${url} -> ${String(durum)}`);
        else if (durum >= 200 && durum < 300) {
          const sizan = [...tumBKimlikleri].find((bid) => govde.includes(bid));
          if (sizan) sorunlar.push(`${r.method} ${url} -> ${String(durum)} B kimligi sizdi`);
        }
      }
    }
    expect(denenen).toBeGreaterThan(100);
    expect(sorunlar).toEqual([]);
  }, 600_000);

  it('kurum parametresiz hesap uclari: baska kullanicinin oturumu/istegi silinemez', async () => {
    const [oturum] = await sistem<{ id: string }[]>`
      select id from hesap.oturumlar where kullanici_id = ${b.k.kullaniciId} limit 1`;
    expect(oturum).toBeDefined();
    const sil = await app.inject({
      method: 'DELETE',
      url: `/v1/hesap/oturumlar/${oturum?.id ?? ''}`,
      headers: bearer(a.token),
    });
    expect([403, 404]).toContain(sil.statusCode);
    const hala = await sistem`select 1 from hesap.oturumlar where id = ${oturum?.id ?? ''} and iptal_at is null`;
    expect(hala.length).toBe(1);
    const liste = await app.inject({ url: '/v1/hesap/oturumlar', headers: bearer(a.token) });
    expect(liste.body).not.toContain(oturum?.id ?? 'yok');
  });
});
