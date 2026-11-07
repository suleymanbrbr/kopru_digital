import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { palette, themes } from '@kopru/ui-tokens';
import { describe, expect, it } from 'vitest';

import { temaCssUret } from '../../scripts/tema.ts';

const dosya = join(process.cwd(), 'src/styles/tema.generated.css');

describe('tema CSS', () => {
  it('kayitli dosya ui-tokens degerleriyle birebir ayni (pnpm hazirla)', () => {
    expect(readFileSync(dosya, 'utf8')).toBe(temaCssUret());
  });

  it('acik ve koyu tema ile vurgu degiskenlerini icerir', () => {
    const css = temaCssUret();
    expect(css).toContain(`--vurgu: ${themes.acik.vurgu};`);
    expect(css).toContain(`--vurgu: ${themes.koyu.vurgu};`);
    expect(css).toContain(`--color-vurgu: var(--vurgu);`);
    expect(css).toContain(`--color-marka-600: ${palette.marka[600]};`);
    expect(css).toMatch(/\.dark \{/);
  });
});
