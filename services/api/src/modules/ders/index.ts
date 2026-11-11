import { defineModule } from '../define-module.js';
import { dersDegisiklikYollari } from './ders-degisiklik-yollari.js';
import { dersYollari } from './ders-yollari.js';
import { geriBildirimYollari } from './geri-bildirim-yollari.js';
import { kayitlarimYollari } from './kayitlarim-yollari.js';
import { kaynakYollari } from './kaynak-yollari.js';
import { yoklamaYollari } from './yoklama-yollari.js';

/**
 * ders modulu: takvim (tekil ve tekrarlayan dersler, erteleme, iptal, katilimcilar).
 * Rotalar `app.kimlik` (hesap modulu) hazirsa kaydolur; DATABASE_URL yoksa kaydolmaz.
 * Yoklama (toplu, idempotent, kredi/ucret dususuyle ayni islemde) ve katilimci esitleme de burada;
 * Ders sonu geri bildirimi, ders kayitlari/materyalleri ("Kayitlarim", izledim, acilmiyor bildirimi) de burada.
 */
export const dersModule = defineModule('ders', async (app) => {
  if (app.hasDecorator('kimlik')) {
    await app.register(dersYollari);
    await app.register(dersDegisiklikYollari);
    await app.register(yoklamaYollari);
    await app.register(geriBildirimYollari);
    await app.register(kaynakYollari);
    await app.register(kayitlarimYollari);
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
