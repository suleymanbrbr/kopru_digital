import { describe, expect, it } from 'vitest';

import { modules } from './index.js';

describe('api modulleri', () => {
  it('bes modul /v1/<ad> onekiyle tanimli', () => {
    expect(modules.map((m) => [m.name, m.prefix])).toEqual([
      ['hesap', '/v1/hesap'],
      ['ders', '/v1/ders'],
      ['finans', '/v1/finans'],
      ['ogrenme', '/v1/ogrenme'],
      ['abonelik', '/v1/abonelik'],
    ]);
  });
});
