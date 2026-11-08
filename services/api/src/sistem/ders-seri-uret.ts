import type { Database } from '@kopru/service-kit';
import { and, eq, lt } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { dersSerileri } from '../db/schema.js';
import {
  SERI_UFUK_GUN,
  bitisleSinirla,
  bugunYerel,
  seriDerslerUret,
  tarihEkle,
} from '../modules/ders/index.js';
import { withSistem } from './with-sistem.js';

export interface DersSeriUretimOzeti {
  kurum: number;
  seri: number;
  uretilen: number;
  atlanan: number;
  hata: number;
}

export interface DersSeriUretimSecenegi {
  /** Testler icin; varsayilan: simdi. */
  simdi?: Date;
  log?: { error(nesne: unknown, mesaj: string): void };
}

/**
 * Gece isi: aktif tekrarlayan serilerin derslerini 12 hafta (84 gun) ileriye uzatir. Hicbir kurum
 * baglami olmadan her kurumda calisir, bu yuzden `api_sistem` (`withSistem`) kullanir ve her kurum
 * icin nedeni `hesap.denetim_kayitlari`na yazar (ADR 0003).
 *
 * Idempotenttir: `UNIQUE (seri_id, seri_sirasi)` + `ON CONFLICT DO NOTHING`; is iki kez (ya da iki worker
 * ayni anda) calisirsa yeni satir olusmaz. Yapilacak is yoksa hicbir islem/denetim satiri yazilmaz, bu
 * yuzden saatlik cagri guvenlidir. Cakisan seri dersi atlanir (kullaniciya sorulamaz), seriyi dusurmez.
 */
export async function dersSerileriniUret(
  db: Database | null,
  secenek: DersSeriUretimSecenegi = {},
): Promise<DersSeriUretimOzeti> {
  if (!db) throw new Error('DATABASE_SISTEM_URL tanımlı değil: ders serileri üretilemez.');
  const simdi = secenek.simdi ?? new Date();
  const ozet: DersSeriUretimOzeti = { kurum: 0, seri: 0, uretilen: 0, atlanan: 0, hata: 0 };

  // Genis aday suzgeci (UTC gunu + 1 gun pay: saat dilimi farki); asil karar seri saat diliminde.
  const adayUfuk = tarihEkle(simdi.toISOString().slice(0, 10), SERI_UFUK_GUN + 1);
  const adaylar = await db.orm
    .select()
    .from(dersSerileri)
    .where(and(eq(dersSerileri.durum, 'aktif'), lt(dersSerileri.uretildi_son_tarih, adayUfuk)));
  const isler = new Map<string, string[]>();
  for (const s of adaylar) {
    const ufuk = tarihEkle(bugunYerel(s.saat_dilimi, simdi), SERI_UFUK_GUN);
    if (bitisleSinirla(ufuk, s.bitis_tarihi) <= s.uretildi_son_tarih) continue;
    isler.set(s.kurum_id, [...(isler.get(s.kurum_id) ?? []), s.id]);
  }

  for (const [kurumId, seriIdleri] of isler) {
    ozet.kurum++;
    await withSistem(
      db,
      {
        eylem: 'sistem.ders_seri_uret',
        neden: 'Gece işi: tekrarlayan ders serilerini 12 hafta ileriye uzat',
        kurumId,
        hedefTuru: 'kurum',
        hedefId: kurumId,
        ayrinti: { seri_sayisi: seriIdleri.length },
      },
      async (tx) => {
        for (const seriId of seriIdleri) {
          try {
            // Her seri kendi savepoint'inde: biri patlarsa digerleri etkilenmez.
            await tx.transaction(async (sp) => {
              const [seri] = await sp
                .select()
                .from(dersSerileri)
                .where(and(eq(dersSerileri.id, seriId), eq(dersSerileri.durum, 'aktif')))
                .for('update', { skipLocked: true });
              if (!seri) return;
              const bugun = bugunYerel(seri.saat_dilimi, simdi);
              const ufuk = tarihEkle(bugun, SERI_UFUK_GUN);
              if (bitisleSinirla(ufuk, seri.bitis_tarihi) <= seri.uretildi_son_tarih) return;
              const sonuc = await seriDerslerUret(sp, seri, {
                ufuk,
                alt: bugun,
                cakisma: 'atla',
                baglam: {
                  kurumId,
                  actor: { tur: 'sistem', id: 'ders-seri-isi' },
                  correlationId: `ders-seri-isi-${uuidv7()}`,
                },
                olusturan: null,
              });
              ozet.seri++;
              ozet.uretilen += sonuc.olusan.length;
              ozet.atlanan += sonuc.atlanan.filter((a) => a.neden === 'cakisma').length;
            });
          } catch (err) {
            ozet.hata++;
            secenek.log?.error({ err, seri_id: seriId }, 'ders serisi üretilemedi');
          }
        }
      },
    );
  }
  return ozet;
}
