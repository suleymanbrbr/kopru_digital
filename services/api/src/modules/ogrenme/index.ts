import { defineModule } from '../define-module.js';
import { mufredatYollari } from './mufredat-yollari.js';

/**
 * ogrenme modulu: kendi PostgreSQL semasina (`ogrenme`) sahip. Mufredat kutuphanesi burada;
 * odev, plan ve deneme sonraki paketlerdir. Rotalar `app.kimlik` hazirsa kaydolur.
 */
export const ogrenmeModule = defineModule('ogrenme', async (app) => {
  if (app.hasDecorator('kimlik')) {
    await app.register(mufredatYollari);
  }
});
