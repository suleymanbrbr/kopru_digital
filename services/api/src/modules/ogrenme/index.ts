import { defineModule } from '../define-module.js';
import { denemeAnalizYollari } from './deneme-analiz-yollari.js';
import { denemeExcelYollari } from './deneme-excel-yollari.js';
import { denemeKuralYollari } from './deneme-kural-yollari.js';
import { denemeYollari } from './deneme-yollari.js';
import { gunlukSoruAnalizYollari } from './gunluk-soru-analiz-yollari.js';
import { gunlukSoruYollari } from './gunluk-soru-yollari.js';
import { kaynakKitapYollari } from './kaynak-kitap-yollari.js';
import { mufredatPlatformYollari } from './mufredat-platform-yollari.js';
import { mufredatYollari } from './mufredat-yollari.js';
import { odevOgrenciYollari } from './odev-ogrenci-yollari.js';
import { odevSablonYollari } from './odev-sablon-yollari.js';
import { odevTeslimYollari } from './odev-teslim-yollari.js';
import { odevYollari } from './odev-yollari.js';
import { planOgrenciYollari } from './plan-ogrenci-yollari.js';
import { planSablonYollari } from './plan-sablon-yollari.js';
import { planYollari } from './plan-yollari.js';
import { raporExcelYollari } from './rapor-excel.js';
import { raporYollari } from './rapor.js';
import { soruOgretmenYollari } from './soru-ogretmen-yollari.js';
import { soruYollari } from './soru-yollari.js';
import { soruYonetimYollari } from './soru-yonetim-yollari.js';

/**
 * ogrenme modulu (`ogrenme` PostgreSQL semasi): mufredat kutuphanesi ve odev (hedefleme, fan-out,
 * teslim, inceleme, sablon), haftalik plan (plan, gorev, sablon, ogrenci gunluk giris, devretme) ve
 * deneme analizi, soru sor (soru, cevap, masa, kota, bildirim, olcum) ve gunluk soru takibi (kaynak kitap,
 * gunluk kayit, konu analizi, zorluk bandi ve oneriler, haftalik ozet, gorev ver). Rotalar `app.kimlik` (hesap modulu) hazirsa
 * kaydolur.
 */
export const ogrenmeModule = defineModule(
  'ogrenme',
  async (app) => {
    if (app.hasDecorator('kimlik')) {
      await app.register(mufredatYollari);
      await app.register(odevYollari);
      await app.register(odevSablonYollari);
      await app.register(odevOgrenciYollari);
      await app.register(odevTeslimYollari);
      await app.register(planYollari);
      await app.register(planSablonYollari);
      await app.register(planOgrenciYollari);
      await app.register(denemeKuralYollari);
      await app.register(denemeYollari);
      await app.register(denemeExcelYollari);
      await app.register(denemeAnalizYollari);
      await app.register(soruYollari);
      await app.register(soruOgretmenYollari);
      await app.register(raporYollari);
      await app.register(raporExcelYollari);
      await app.register(soruYonetimYollari);
      await app.register(kaynakKitapYollari);
      await app.register(gunlukSoruYollari);
      await app.register(gunlukSoruAnalizYollari);
    }
  },
  {
    // Platform uclari `/v1` oneksiz: `/platform/mufredat/...` (ADR 0004).
    rootPlugin: async (app) => {
      if (app.hasDecorator('kimlik')) await app.register(mufredatPlatformYollari);
    },
  },
);

// Plan takvimi (Europe/Istanbul haftasi) yardimcilari: testler ve diger moduller yalniz bu yuzeyi kullanir.
export {
  gunFarki,
  haftaBaslangici,
  haftaKilitliMi,
  haftaninGunu,
  pazartesiMi,
  planBugunu,
  tarihEkle,
} from './plan-zaman.js';
