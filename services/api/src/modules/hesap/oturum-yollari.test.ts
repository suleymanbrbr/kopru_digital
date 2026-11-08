import { describe, expect, it } from 'vitest';

import { cihazKisalt, ipMaskele } from './oturum-yollari.js';

describe('oturum yonetimi: saf yardimcilar', () => {
  it('cihaz kisaltilir, IP maskelenir', () => {
    expect(cihazKisalt(null, null)).toBeNull();
    expect(cihazKisalt('  ', null)).toBeNull();
    expect(cihazKisalt('iPhone 15', 'ua')).toBe('iPhone 15');
    const uzun = cihazKisalt(null, 'x'.repeat(300));
    expect(uzun).toHaveLength(80);
    expect(uzun?.endsWith('…')).toBe(true);
    expect(ipMaskele(null)).toBeNull();
    expect(ipMaskele('192.168.4.77')).toBe('192.168.*.*');
    expect(ipMaskele('10.1.2.3/32')).toBe('10.1.*.*');
    expect(ipMaskele('::ffff:172.16.9.8')).toBe('172.16.*.*');
    expect(ipMaskele('2001:db8:85a3::8a2e:370:7334')).toBe('2001:db8:*');
  });
});
