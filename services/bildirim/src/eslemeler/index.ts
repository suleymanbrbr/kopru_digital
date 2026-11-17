import type { Esleme } from './esleme.js';
import { seriRiskEsleme } from './seri-risk.js';
import { soruCevapEsleme } from './soru-cevap.js';

export type { Esleme } from './esleme.js';

/**
 * Kayit listesi: `bildirim.uretim` tuketicisi bu listedeki olaylari dinler. Yeni eslemeyi buraya ekleyin
 * (ve `sablonlar.ts`'e sablonunu).
 */
export const ESLEMELER: readonly Esleme[] = [soruCevapEsleme, seriRiskEsleme];
