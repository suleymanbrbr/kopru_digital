import { afterEach, describe, expect, it } from 'vitest';

import {
  mockDurumAnahtari,
  mockDurumAnahtariAyarla,
  mockDurumAnahtariOku,
  mockDurumDepoAnahtari,
} from './mock-durum';

afterEach(() => mockDurumAnahtariAyarla(undefined));

describe('mock durum anahtari', () => {
  it('yalniz kucuk harf/rakam, 1-32 karakter kabul eder', () => {
    expect(mockDurumAnahtariOku('abc123')).toBe('abc123');
    expect(mockDurumAnahtariOku(undefined)).toBeUndefined();
    expect(mockDurumAnahtariOku('')).toBeUndefined();
    expect(mockDurumAnahtariOku('A|b')).toBeUndefined();
    expect(mockDurumAnahtariOku('a'.repeat(33))).toBeUndefined();
  });

  it('ayarlanan anahtar depo anahtarina yansir; ayar kaldirilinca varsayilana doner', () => {
    expect(mockDurumDepoAnahtari('k1')).toBe('|k1');
    mockDurumAnahtariAyarla('x1');
    expect(mockDurumAnahtari()).toBe('x1');
    expect(mockDurumDepoAnahtari('k1')).toBe('x1|k1');
    mockDurumAnahtariAyarla(undefined);
    expect(mockDurumDepoAnahtari('k1')).toBe('|k1');
  });
});
