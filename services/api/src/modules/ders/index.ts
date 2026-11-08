import { defineModule } from '../define-module.js';
import { dersDegisiklikYollari } from './ders-degisiklik-yollari.js';
import { dersYollari } from './ders-yollari.js';
import { yoklamaYollari } from './yoklama-yollari.js';

/**
 * ders modulu: takvim (tekil ve tekrarlayan dersler, erteleme, iptal, katilimcilar).
 * Rotalar `app.kimlik` (hesap modulu) hazirsa kaydolur; DATABASE_URL yoksa kaydolmaz.
 * Yoklama (toplu, idempotent, kredi/ucret dususuyle ayni islemde) ve katilimci esitleme de burada;
 * geri bildirim ve kaynaklar sonraki paketlerdir.
 */
export const dersModule = defineModule('ders', async (app) => {
  if (app.hasDecorator('kimlik')) {
    await app.register(dersYollari);
    await app.register(dersDegisiklikYollari);
    await app.register(yoklamaYollari);
  }
});

export { seriDerslerUret, SERI_UFUK_GUN, bitisleSinirla } from './seri-uretimi.js';
export { bugunYerel, tarihEkle, utcdenYerel } from './zaman.js';
export type { DersOlayBaglami } from './ders-deposu.js';
export {
  dersKatilimcilariniEsitle,
  esitlenecekDersler,
  type EsitlemeKapsami,
  type EsitlemeSonucu,
} from './katilimci-esitle.js';
