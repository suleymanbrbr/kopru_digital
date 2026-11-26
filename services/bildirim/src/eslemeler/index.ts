import { davetKabulEsleme } from './davet-kabul.js';
import { degerlendirmeYayimlandiEsleme } from './degerlendirme-yayimlandi.js';
import { dersDegistiEsleme } from './ders-degisti.js';
import { dersKaynakEklendiEsleme } from './ders-kaynak-eklendi.js';
import { dersKaynakSorunEsleme } from './ders-kaynak-sorun.js';
import { dersYoklamaEsleme } from './ders-yoklama.js';
import type { Esleme } from './esleme.js';
import { krediAzaldiEsleme, paketSatildiEsleme, tahsilatAlindiEsleme } from './finans.js';
import { kaynakOnerisiEklendiEsleme } from './kaynak-onerisi-eklendi.js';
import { karakterEvrildiEsleme } from './motivasyon-karakter.js';
import { rozetKazanildiEsleme } from './motivasyon-rozet.js';
import { seriBozuldiEsleme, seriKilometreTasiEsleme } from './motivasyon-seri.js';
import { seviyeAtladiEsleme } from './motivasyon-seviye.js';
import { mufredatYayinlandiEsleme } from './mufredat-yayinlandi.js';
import { odevIncelendiEsleme } from './odev-incelendi.js';
import { odevTeslimEsleme } from './odev-teslim.js';
import { odevYayinlandiEsleme } from './odev-yayinlandi.js';
import { seriRiskEsleme } from './seri-risk.js';
import { soruCevapEsleme } from './soru-cevap.js';
import { soruSorildiEsleme } from './soru-sorildi.js';

export type { Esleme } from './esleme.js';

/**
 * Kayit listesi: `bildirim.uretim` tuketicisi bu listedeki olaylari dinler. Yeni eslemeyi buraya ekleyin
 * (ve `sablonlar.ts`'e sablonunu). Bir olay turu listede YALNIZ BIR kez yer alir (tuketici olay turune gore
 * eslemeyi bulur).
 */
export const ESLEMELER: readonly Esleme[] = [
  soruCevapEsleme,
  seriRiskEsleme,
  dersDegistiEsleme,
  dersYoklamaEsleme,
  dersKaynakEklendiEsleme,
  dersKaynakSorunEsleme,
  odevYayinlandiEsleme,
  odevTeslimEsleme,
  odevIncelendiEsleme,
  soruSorildiEsleme,
  seviyeAtladiEsleme,
  rozetKazanildiEsleme,
  karakterEvrildiEsleme,
  seriKilometreTasiEsleme,
  seriBozuldiEsleme,
  krediAzaldiEsleme,
  tahsilatAlindiEsleme,
  paketSatildiEsleme,
  davetKabulEsleme,
  mufredatYayinlandiEsleme,
  degerlendirmeYayimlandiEsleme,
  kaynakOnerisiEklendiEsleme,
];
