import type { Database } from '@kopru/service-kit';
import { eq } from 'drizzle-orm';

import {
  abonelikler,
  abonelikOdemeleri,
  faturalar,
  kurumFaturaBilgileri,
  planlar,
} from '../../db/schema.js';
import {
  faturaAdaylariniAl,
  faturaHatasiYaz,
  faturaKesildiYaz,
  type FaturaAdayi,
} from '../../sistem/abonelik-odeme-sistem.js';
import type { EArsivSaglayici } from './earsiv.js';
import type { FaturaAdresi } from './fatura-tipleri.js';
import type { OdemeGunlugu } from './odeme-kanallari.js';

export interface FaturaIsiOzeti {
  denenen: number;
  kesilen: number;
  /** Bu calismada deneme hakki biten (durum `hata`) fatura sayisi. */
  hata: number;
}

async function faturayiKes(
  db: Database,
  eArsiv: EArsivSaglayici,
  log: OdemeGunlugu,
  f: FaturaAdayi,
): Promise<'kesildi' | 'hata' | 'yeniden'> {
  try {
    const [bilgi] = await db.orm
      .select({ eposta: kurumFaturaBilgileri.eposta })
      .from(kurumFaturaBilgileri)
      .where(eq(kurumFaturaBilgileri.kurum_id, f.kurum_id));
    const [odeme] = await db.orm
      .select({ planAdi: planlar.ad, tersCevrilenId: abonelikOdemeleri.ters_cevrilen_id })
      .from(abonelikOdemeleri)
      .innerJoin(abonelikler, eq(abonelikler.id, abonelikOdemeleri.abonelik_id))
      .innerJoin(planlar, eq(planlar.id, abonelikler.plan_id))
      .where(eq(abonelikOdemeleri.id, f.odeme_id));
    let iadeEdilenNo: string | null = null;
    if (f.tur === 'iade' && odeme?.tersCevrilenId) {
      const [asil] = await db.orm
        .select({ no: faturalar.fatura_no })
        .from(faturalar)
        .where(eq(faturalar.odeme_id, odeme.tersCevrilenId));
      iadeEdilenNo = asil?.no ?? null;
    }
    const sonuc = await eArsiv.faturaKes({
      faturaId: f.id,
      kurumId: f.kurum_id,
      tur: f.tur === 'iade' ? 'iade' : 'e_arsiv',
      alici: {
        unvan: f.alici_unvan,
        vergiNo: f.alici_vergi_no,
        adres: f.alici_adres as FaturaAdresi,
        eposta: bilgi?.eposta ?? '',
      },
      matrahKurus: f.matrah_kurus,
      kdvKurus: f.kdv_kurus,
      toplamKurus: f.toplam_kurus,
      kdvOrani: f.kdv_orani,
      kalemAdi: odeme ? `Köprü abonelik: ${odeme.planAdi}` : 'Köprü abonelik',
      iadeEdilenFaturaNo: iadeEdilenNo,
    });
    const yazildi = await faturaKesildiYaz(db, f, {
      faturaNo: sonuc.faturaNo,
      ettn: sonuc.ettn,
      entegrator: eArsiv.ad,
      entegratorRef: sonuc.entegratorRef,
      pdfDosyaId: sonuc.pdfDosyaId ?? null,
    });
    return yazildi ? 'kesildi' : 'yeniden';
  } catch (err) {
    const mesaj = err instanceof Error ? err.message : String(err);
    const sonuc = await faturaHatasiYaz(db, f, mesaj);
    const nesne = { faturaId: f.id, kurumId: f.kurum_id, deneme: f.deneme_sayisi, hata: mesaj };
    if (sonuc === 'hata') {
      log.error(nesne, 'abonelik_fatura_alarm: fatura kesilemedi, deneme sınırı aşıldı');
      return 'hata';
    }
    log.warn(nesne, 'abonelik_fatura_hatasi: yeniden denenecek');
    return 'yeniden';
  }
}

/**
 * e-Arsiv is: `bekliyor` faturalari saglayiciya gonderir (1 dk, 5 dk, 15 dk, 1 sa, 6 sa geri cekilmeyle en cok 6
 * deneme). Sonuncu denemeden sonra `durum='hata'` ve alarm logu. Basarida `abonelik.fatura.kesildi.v1`.
 * Idempotent, cokcu worker guvenli (`for update skip locked`); `simdi` testte zamani ilerletir.
 */
export async function faturalariKes(
  db: Database,
  eArsiv: EArsivSaglayici,
  log: OdemeGunlugu,
  simdi: Date = new Date(),
  limit = 10,
  kurumId?: string,
): Promise<FaturaIsiOzeti> {
  const { adaylar, takilan } = await faturaAdaylariniAl(db, simdi, limit, kurumId);
  for (const t of takilan) {
    log.error(
      { faturaId: t.id, kurumId: t.kurum_id },
      'abonelik_fatura_alarm: fatura deneme sınırında takılıp hataya alındı',
    );
  }
  const ozet: FaturaIsiOzeti = { denenen: adaylar.length, kesilen: 0, hata: takilan.length };
  for (const f of adaylar) {
    const s = await faturayiKes(db, eArsiv, log, f);
    if (s === 'kesildi') ozet.kesilen += 1;
    if (s === 'hata') ozet.hata += 1;
  }
  return ozet;
}
