import { describe, expect, it } from 'vitest';

import { runChecks, type Check } from './checks.js';
import { renderTable } from './report.js';
import { atLeastMajor, javaMajor, parseVersion } from './versions.js';

describe('versions', () => {
  it('surum ayiklar ve karsilastirir', () => {
    expect(parseVersion('v24.1.0')).toEqual([24, 1, 0]);
    expect(atLeastMajor('10.28.0', 10)).toBe(true);
    expect(atLeastMajor('9.15.0', 10)).toBe(false);
    expect(atLeastMajor('yok', 10)).toBe(false);
  });

  it('java ana surumunu bulur', () => {
    expect(javaMajor('openjdk version "17.0.9" 2023-10-17')).toBe(17);
    expect(javaMajor('java version "1.8.0_392"')).toBe(8);
    expect(javaMajor('bilinmeyen')).toBeUndefined();
  });
});

describe('runChecks', () => {
  const macCheck: Check = {
    name: 'mac araci',
    macOnly: true,
    run: () => ({ status: 'fail', detail: 'yok', hint: 'brew install x' }),
  };
  const anyCheck: Check = {
    name: 'her yerde',
    macOnly: false,
    run: () => ({ status: 'ok', detail: '1' }),
  };

  it('macOS disinda macOS-only kontrolleri atlar (calistirmaz)', () => {
    const rows = runChecks([macCheck, anyCheck], 'linux');
    expect(rows.map((row) => row.result.status)).toEqual(['skip', 'ok']);
  });

  it('macOS ta calistirir ve tabloda cozum ipucunu gosterir', () => {
    const table = renderTable(runChecks([macCheck, anyCheck], 'darwin'), false);
    expect(table).toContain('✗  mac araci');
    expect(table).toContain('brew install x');
    expect(table).toContain('1 sorun var');
  });

  it('calisan kontrol patlarsa cokmez', () => {
    const boom: Check = {
      name: 'patlayan',
      macOnly: false,
      run: () => {
        throw new Error('x');
      },
    };
    expect(runChecks([boom], 'linux')[0]?.result.status).toBe('fail');
  });
});
