import { describe, expect, it } from 'vitest';

import { cspOlustur, sabitBasliklar } from './csp';

describe('yonetim paneli basliklari', () => {
  it('CSP dis kaynak ve cerceveye izin vermez', () => {
    const csp = cspOlustur(true);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/https?:\/\//);
  });

  it('HSTS uretimde, no-store ve noindex her zaman', () => {
    const k = (u: boolean) => sabitBasliklar(u).map((b) => b.key);
    expect(k(true)).toContain('Strict-Transport-Security');
    expect(k(false)).not.toContain('Strict-Transport-Security');
    expect(k(false)).toEqual(expect.arrayContaining(['Cache-Control', 'X-Robots-Tag']));
  });
});
