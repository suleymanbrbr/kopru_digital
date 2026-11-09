import { defineModule } from '../define-module.js';
import { mufredatYollari } from './mufredat-yollari.js';
import { odevOgrenciYollari } from './odev-ogrenci-yollari.js';
import { odevSablonYollari } from './odev-sablon-yollari.js';
import { odevYollari } from './odev-yollari.js';
import { planOgrenciYollari } from './plan-ogrenci-yollari.js';
import { planSablonYollari } from './plan-sablon-yollari.js';
import { planYollari } from './plan-yollari.js';

/**
 * ogrenme modulu (`ogrenme` PostgreSQL semasi): mufredat kutuphanesi ve odev (hedefleme, fan-out,
 * teslim, inceleme, sablon) ve haftalik plan (plan, gorev, sablon, ogrenci gunluk giris, devretme).
 * Rotalar `app.kimlik` (hesap modulu) hazirsa kaydolur. Deneme ve soru sonraki paketlerdir.
 */
export const ogrenmeModule = defineModule('ogrenme', async (app) => {
  if (app.hasDecorator('kimlik')) {
    await app.register(mufredatYollari);
    await app.register(odevYollari);
    await app.register(odevSablonYollari);
    await app.register(odevOgrenciYollari);
    await app.register(planYollari);
    await app.register(planSablonYollari);
    await app.register(planOgrenciYollari);
  }
});
