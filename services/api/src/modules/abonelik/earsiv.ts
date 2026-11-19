import type { FaturaAdresi } from './fatura-tipleri.js';

/**
 * e-Arsiv entegrator arayuzu. Gercek entegrator (ornegin ozel entegrator API'si) sonraki iste bu arayuzun
 * arkasina takilir; simdilik `LogEArsivSaglayici` (hicbir yere gondermez, deterministik numara uretir).
 * Kisisel/fatura verisi (unvan, vergi no, e-posta) log'a yazilmaz.
 */
export interface FaturaKesGirdisi {
  faturaId: string;
  kurumId: string;
  tur: 'e_arsiv' | 'iade';
  alici: { unvan: string; vergiNo: string; adres: FaturaAdresi; eposta: string };
  matrahKurus: number;
  kdvKurus: number;
  toplamKurus: number;
  kdvOrani: number;
  /** Fatura kalem aciklamasi (ornegin plan adi). */
  kalemAdi: string;
  /** `iade`: iade edilen faturanin numarasi (varsa). */
  iadeEdilenFaturaNo: string | null;
}

export interface FaturaKesSonucu {
  faturaNo: string;
  /** Evrensel tekil fatura no (UUID). */
  ettn: string;
  entegratorRef: string | null;
  pdfDosyaId?: string | null;
}

export interface EArsivSaglayici {
  readonly ad: string;
  /** Idempotent olmalidir: ayni `faturaId` ile tekrar cagri ayni faturayi dondurur (yeniden deneme guvenligi). */
  faturaKes(girdi: FaturaKesGirdisi): Promise<FaturaKesSonucu>;
}

export interface EArsivGunlugu {
  info(nesne: Record<string, unknown>, mesaj: string): void;
}

/** Gelistirme saglayicisi: fatura `fatura_id`sinden turetilen numarayla "kesilir"; PDF yoktur. */
export class LogEArsivSaglayici implements EArsivSaglayici {
  readonly ad = 'log';

  constructor(private readonly log: EArsivGunlugu) {}

  faturaKes(girdi: FaturaKesGirdisi): Promise<FaturaKesSonucu> {
    const yil = new Date().getUTCFullYear();
    const faturaNo = `LOG${String(yil)}${girdi.faturaId.replaceAll('-', '').slice(-9).toUpperCase()}`;
    this.log.info(
      {
        faturaId: girdi.faturaId,
        kurumId: girdi.kurumId,
        tur: girdi.tur,
        toplamKurus: girdi.toplamKurus,
        faturaNo,
      },
      'e_arsiv_fatura_kesildi_log',
    );
    return Promise.resolve({
      faturaNo,
      ettn: girdi.faturaId,
      entegratorRef: null,
      pdfDosyaId: null,
    });
  }
}
