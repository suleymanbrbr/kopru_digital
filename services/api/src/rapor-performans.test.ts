import { readFileSync } from 'node:fs';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dersYardimcilari } from './test/ders-yardimcilar.js';
import { bearer, dbYok, testDb, testServisi } from './test/yardimcilar.js';

/**
 * Sartname kalite citasi: "1.000 ogrencili kurumda panel 2 saniyede acilir". Tohum:
 * `scripts/rapor-tohum.sql` (1.000 ogrenci, 50 grup, 30 ogretmen, 30 gunluk yoklama/odev/plan/soru/geri
 * bildirim). Hedef: her uc medyan < 500 ms; panelin uc ozet ucunu paralel cagirmasi (toplam) < 2 sn.
 */
describe.skipIf(dbYok())('panel rapor ozetleri performansi (1.000 ogrenci)', () => {
  const urls = testDb();
  const t = testServisi({ RATE_LIMIT_MAX: '100000' });
  let sistem: postgres.Sql;

  beforeAll(() => {
    if (!urls) return;
    sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
  });
  afterAll(async () => {
    await t.service.stop();
    await sistem.end();
  });

  const medyan = (n: number[]) => [...n].sort((a, b) => a - b)[Math.floor(n.length / 2)] ?? 0;

  it('her ozet ucu medyan 500 ms altinda; panelin paralel toplami 2 sn altinda', async () => {
    const y = dersYardimcilari({ t, sistem });
    const k = await y.kurumluKullanici();
    const sql = readFileSync(
      new URL('../scripts/rapor-tohum.sql', import.meta.url),
      'utf8',
    ).replaceAll('{{KURUM_ID}}', k.kurumId);
    await sistem.unsafe(sql);
    // ANALYZE yalniz tablo sahibinin (migration rolu) yapabildigi bir islem; canlida autovacuum yapar.
    const sahip = postgres(urls?.ownerUrl ?? '', { max: 1, onnotice: () => undefined });
    await sahip.unsafe('analyze');
    await sahip.end();

    const url = (modul: string, yol: string) => `/v1/${modul}/kurumlar/${k.kurumId}/rapor/${yol}`;
    const ucler = [
      url('hesap', 'ozet?donem=30'),
      url('ders', 'ozet?donem=30'),
      url('ogrenme', 'ozet?donem=30'),
      url('hesap', 'ogrenciler'),
      url('ders', 'devam?donem=30'),
      url('ders', 'anladim?donem=30'),
      url('ogrenme', 'odev?donem=30'),
      url('ogrenme', 'plan?donem=30'),
      url('ogrenme', 'soru?donem=30'),
    ];
    const al = (u: string) => y.app.inject({ url: u, headers: bearer(k.token) });
    // Isinma (plan onbellegi, ilk baglantilar).
    for (const u of ucler) expect((await al(u)).statusCode, u).toBe(200);

    const sonuclar: string[] = [];
    const sureMedyanlari: number[] = [];
    for (const u of ucler) {
      const sureler: number[] = [];
      for (let i = 0; i < 5; i += 1) {
        const bas = performance.now();
        const res = await al(u);
        sureler.push(performance.now() - bas);
        expect(res.statusCode).toBe(200);
      }
      sonuclar.push(`${u.split('/rapor/')[1] ?? u}: ${medyan(sureler).toFixed(0)} ms`);
      sureMedyanlari.push(medyan(sureler));
    }
    console.log(`[rapor-performans] ${sonuclar.join(' | ')}`);

    const toplamlar: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const bas = performance.now();
      const yanitlar = await Promise.all(ucler.slice(0, 3).map(al));
      toplamlar.push(performance.now() - bas);
      for (const r of yanitlar) expect(r.statusCode).toBe(200);
    }
    const kurumlar = (await Promise.all(ucler.slice(0, 3).map(al))).map(
      (r) => r.json<{ kurum: unknown }>().kurum,
    );
    console.log(
      `[rapor-performans] ${sonuclar.join(' | ')} | paralel uc ozet medyan ${medyan(toplamlar).toFixed(0)} ms | ` +
        `kurum: ${kurumlar.map((x) => JSON.stringify(x)).join(' ')}`,
    );
    for (const ms of sureMedyanlari) expect(ms).toBeLessThan(500);
    expect(medyan(toplamlar)).toBeLessThan(2000);

    // Excel: tum sayfalar tek istekte.
    const bas = performance.now();
    const xl = await al(url('ogrenme', 'disa-aktar?donem=30'));
    console.log(`[rapor-performans] disa-aktar: ${(performance.now() - bas).toFixed(0)} ms`);
    expect(xl.statusCode).toBe(200);
  }, 120_000);
});
