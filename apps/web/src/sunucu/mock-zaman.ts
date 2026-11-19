/**
 * Mock modunda "simdi"nin tek kaynagi. `E2E_KAYMA_MS` verilmisse (Playwright config) gercek saate
 * sabit bir kayma eklenir; gecen sure korunur. Boylece e2e, gunun saatinden ve haftanin gunuunden
 * bagimsiz olur. Yalniz `*-mock.ts` dosyalari kullanir; uretim kodu gercek saati kullanir.
 */
const kayma = Number(process.env.E2E_KAYMA_MS ?? 0);

export function mockSimdi(): number {
  return Date.now() + (Number.isFinite(kayma) ? kayma : 0);
}
