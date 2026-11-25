import { metrikler, type Database } from '@kopru/service-kit';

import { faturalariKes } from './fatura-isi.js';
import { bekleyenOlaylariIsle } from './odeme-isleme.js';
import type { OdemeGunlugu, OdemeKanallari } from './odeme-kanallari.js';

/** Zamanlayici araligi: webhook kacarsa/hata verirse en gec bu kadar sonra yeniden denenir (10 sn hedefi). */
export const ODEME_ISI_ARALIGI_MS = 5000;

export interface OdemeIsiOzeti {
  olay: number;
  fatura: number;
}

/** Bir tur: bekleyen olaylari isler, sonra bekleyen faturalari keser. Hata firlatmaz (loglar). */
export async function odemeIsleriniCalistir(
  db: Database,
  kanallar: OdemeKanallari,
  log: OdemeGunlugu,
  simdi: Date = new Date(),
): Promise<OdemeIsiOzeti> {
  const ozet: OdemeIsiOzeti = { olay: 0, fatura: 0 };
  const basla = performance.now();
  let basarili = true;
  try {
    ozet.olay = await bekleyenOlaylariIsle(db, kanallar, log, simdi);
    ozet.fatura = (await faturalariKes(db, kanallar.eArsiv, log, simdi)).denenen;
  } catch (err) {
    basarili = false;
    log.error({ err: String(err) }, 'abonelik_odeme_isi_hatasi');
  }
  metrikler.isCalisti('abonelik-odeme', basarili, (performance.now() - basla) / 1000);
  return ozet;
}

/**
 * Worker sureci icin kisa aralikli zamanlayici (olay isleme + e-Arsiv). pg-boss depoda olmadigi icin
 * `setInterval` orunusu (gecis ve finans isleriyle ayni); isler `skip locked` ile cokcu worker guvenlidir.
 */
export function odemeIsiZamanla(
  db: Database,
  kanallar: OdemeKanallari,
  log: OdemeGunlugu,
  aralikMs: number = ODEME_ISI_ARALIGI_MS,
): () => Promise<void> {
  let calisiyor = false;
  const calistir = async () => {
    if (calisiyor) return;
    calisiyor = true;
    try {
      await odemeIsleriniCalistir(db, kanallar, log);
    } finally {
      calisiyor = false;
    }
  };
  void calistir();
  const zamanlayici = setInterval(() => void calistir(), aralikMs);
  zamanlayici.unref();
  return () => {
    clearInterval(zamanlayici);
    return Promise.resolve();
  };
}
