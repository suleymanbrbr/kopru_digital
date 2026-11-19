import { describe, expect, it } from 'vitest';

import { abonelikYoluIzinliMi } from './abonelik-vekil';

describe('abonelik vekili allowlist', () => {
  it('sahip uclari gecer', () => {
    for (const yol of [
      'kurumlar/k1/planlar',
      'kurumlar/k1/abonelik',
      'kurumlar/k1/fatura-bilgileri',
      'kurumlar/k1/abonelik/iptal',
      'kurumlar/k1/abonelik/plan-degistir',
      'kurumlar/k1/odeme/baslat',
      'kurumlar/k1/odemeler',
      'kurumlar/k1/faturalar',
    ]) {
      expect(abonelikYoluIzinliMi(yol.split('/'), 'POST')).toBe(true);
    }
  });
  it('webhook, odeme donusu ve gecersiz parcalar gecmez', () => {
    for (const yol of [
      'webhook/iyzico',
      'webhook/revenuecat',
      'odeme/iyzico/donus',
      'kurumlar/k1/odeme/baslat/x',
      'kurumlar/k1/abonelik/bilinmeyen',
      'kurumlar/../planlar',
    ]) {
      expect(abonelikYoluIzinliMi(yol.split('/'), 'POST')).toBe(false);
    }
  });
});
