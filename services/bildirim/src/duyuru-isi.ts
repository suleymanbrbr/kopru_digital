import { withTenant, type Database } from '@kopru/service-kit';

import {
  DAGITIM_PARTI,
  dagitilacakDuyuru,
  dagitimBekleyenler,
  dagitimPartisi,
  dagitimiBitir,
} from './duyuru.js';

export interface DuyuruIsiBagimliliklari {
  /** `bildirim_sistem` (BYPASSRLS): bekleyen duyurulari kurumlar arasi listeler. */
  sistem: Pick<Database, 'orm'>;
  /** `bildirim_app` (RLS'e tabi): bildirimler kurum baglaminda uretilir. */
  uygulama: Pick<Database, 'orm'>;
  simdi?: () => Date;
  parti?: number;
  /** Tek calistirmada en fazla bu kadar duyuru (varsayilan 5). */
  duyuruSiniri?: number;
}

export interface DuyuruIsiSonucu {
  duyuru: number;
  bildirim: number;
  /** Dagitimi tamamlanan duyuru sayisi. */
  tamamlanan: number;
  sureMs: number;
}

/**
 * Buyuk hedefli duyurularin kutu bildirimlerini (ve push satirlarini) partiler halinde uretir: her parti ayri
 * kurum-baglamli islem (`DAGITIM_PARTI` alici). Idempotenttir (`tekilAnahtar`): yarida kesilirse sonraki tur
 * kalan alicilardan devam eder; iki worker ayni anda calissa bile cift bildirim olusmaz.
 */
export async function duyuruDagitimIsi(b: DuyuruIsiBagimliliklari): Promise<DuyuruIsiSonucu> {
  const baslangic = performance.now();
  const simdi = b.simdi ?? (() => new Date());
  const bekleyenler = await b.sistem.orm.transaction((tx) =>
    dagitimBekleyenler(tx, b.duyuruSiniri ?? 5),
  );
  let bildirim = 0;
  let tamamlanan = 0;
  for (const { kurum_id: kurumId, id } of bekleyenler) {
    let son: string | null = null;
    for (;;) {
      const sonuc = await withTenant(b.uygulama, { kurumId }, async (tx) => {
        const d = await dagitilacakDuyuru(tx, kurumId, id);
        if (!d) return null;
        return dagitimPartisi(tx, kurumId, d, simdi(), son, b.parti ?? DAGITIM_PARTI);
      });
      if (!sonuc) break; // arsivlendi/silindi: dagitim gereksiz
      if (sonuc.islenen === 0) {
        await withTenant(b.uygulama, { kurumId }, (tx) => dagitimiBitir(tx, kurumId, id, simdi()));
        tamamlanan++;
        break;
      }
      bildirim += sonuc.islenen;
      son = sonuc.sonAliciId;
    }
  }
  return {
    duyuru: bekleyenler.length,
    bildirim,
    tamamlanan,
    sureMs: Math.round(performance.now() - baslangic),
  };
}
