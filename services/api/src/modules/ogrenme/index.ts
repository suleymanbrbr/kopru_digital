import { defineModule } from '../define-module.js';
import { mufredatYollari } from './mufredat-yollari.js';

/**
 * ogrenme modulu: kendi PostgreSQL semasina (`ogrenme`) sahip. Mufredat kutuphanesi burada;
 * odev, plan ve deneme sonraki paketlerdir. Rotalar `app.kimlik` hazirsa kaydolur.
 */
export const ogrenmeModule = defineModule('ogrenme', async (app) => {
  if (app.hasDecorator('kimlik')) {
    await app.register(mufredatYollari);
import { odevOgrenciYollari } from './odev-ogrenci-yollari.js';
import { odevSablonYollari } from './odev-sablon-yollari.js';
import { odevYollari } from './odev-yollari.js';

/**
 * ogrenme modulu (`ogrenme` PostgreSQL semasi): odev (hedefleme, fan-out, teslim, inceleme, sablon).
 * Rotalar `app.kimlik` (hesap modulu) hazirsa kaydolur. Haftalik plan, deneme ve soru sonraki paketlerdir.
 */
export const ogrenmeModule = defineModule('ogrenme', async (app) => {
  if (app.hasDecorator('kimlik')) {
    await app.register(odevYollari);
    await app.register(odevSablonYollari);
    await app.register(odevOgrenciYollari);
  }
});
