import type { Database } from '@kopru/service-kit';

import { abonelikGecisAdayiVarMi, abonelikSistemIslemi } from '../../sistem/abonelik-sistem.js';
import { GECIS_SAYFA, gecisleriUygula, type GecisOzeti } from './yazma.js';

const SAAT_MS = 3_600_000;

export interface GecisIsiGunlugu {
  error(nesne: Record<string, unknown>, mesaj: string): void;
  info(nesne: Record<string, unknown>, mesaj: string): void;
}

/**
 * Abonelik durum makinesinin tek calismasi: vadesi gelen abonelikleri ilerletir (deneme -> sona_erdi, aktif ->
 * iptal / odeme_bekliyor, ek_sure -> askida, askida -> sona_erdi) ve kurum durumunu esitler. Vade yoksa
 * hicbir sey yazmaz (denetim satiri da). Idempotenttir; ayni anda birden cok worker guvenlidir.
 */
export async function abonelikGecisleriCalistir(
  db: Database,
  simdi: Date = new Date(),
): Promise<GecisOzeti> {
  const toplam: GecisOzeti = { gecis: 0, askiyaAlinan: 0, taranan: 0 };
  if (!(await abonelikGecisAdayiVarMi(db, simdi))) return toplam;
  for (let tur = 0; tur < 20; tur += 1) {
    const ozet = await abonelikSistemIslemi(
      db,
      {
        eylem: 'sistem.abonelik_gecisleri',
        neden: 'Saatlik iş: vadesi gelen abonelik durum geçişleri ve kurum durumu eşitleme',
      },
      (tx) => gecisleriUygula(tx, simdi),
    );
    toplam.gecis += ozet.gecis;
    toplam.askiyaAlinan += ozet.askiyaAlinan;
    toplam.taranan += ozet.taranan;
    if (ozet.taranan < GECIS_SAYFA) break;
  }
  return toplam;
}

/**
 * Worker sureci icin saatlik zamanlayici: acilista ve sonra saatte bir. pg-boss henuz depoda yoktur
 * (kendi `pgboss` semasi migration ister); finans gece isi ile ayni arayuz, ona tasinabilir.
 */
export function abonelikGecisIsiZamanla(
  db: Database,
  log: GecisIsiGunlugu,
  simdi: () => Date = () => new Date(),
): () => Promise<void> {
  let calisiyor = false;
  const calistir = async () => {
    if (calisiyor) return;
    calisiyor = true;
    try {
      const ozet = await abonelikGecisleriCalistir(db, simdi());
      if (ozet.gecis > 0) log.info({ ...ozet }, 'abonelik_gecisleri_uygulandi');
    } catch (err) {
      log.error({ err: String(err) }, 'abonelik_gecis_isi_hatasi');
    } finally {
      calisiyor = false;
    }
  };
  void calistir();
  const zamanlayici = setInterval(() => void calistir(), SAAT_MS);
  zamanlayici.unref();
  return () => {
    clearInterval(zamanlayici);
    return Promise.resolve();
  };
}
