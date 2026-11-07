import { describe, expect, it } from 'vitest';

import { themes } from './index.js';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('temalar', () => {
  for (const [ad, t] of Object.entries(themes)) {
    it(`${ad}: metin ve birincil renkler WCAG AA (4.5:1) karsilar`, () => {
      expect(contrast(t.metin, t.arkaPlan)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.metin, t.yuzey)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.metinIkincil, t.yuzey)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.birincilUzeri, t.birincil)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.hata, t.yuzey)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
