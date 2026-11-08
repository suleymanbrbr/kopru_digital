import { YOKLAMA_BEKLEYEN_GUN, YOKLAMA_ISTEK_SAKLAMA_GUN } from '@kopru/contracts';
import type { Database } from '@kopru/service-kit';
import { and, eq, lt, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { dersSerileri } from '../db/schema.js';
import {
  SERI_UFUK_GUN,
  bitisleSinirla,
  bugunYerel,
  dersKatilimcilariniEsitle,
  esitlenecekDersler,
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

export interface DersKatilimciEsitlemeSecenegi extends DersSeriUretimSecenegi {
  /** Yalniz bu kurum (testler ve elle calistirma icin); bos: tum kurumlar. */
  kurumId?: string;
}

export interface DersKatilimciEsitlemeOzeti {
  kurum: number;
  ders: number;
  eklenen: number;
  cikarilan: number;
  hata: number;
}

/**
 * Saatlik is: planli derslerin (gelecek ve yoklama bekleyen son 14 gun) katilimci listesini grup
 * uyeligiyle esitler. Once tum kurumlarda yalniz OKUYAN bir sorguyla is olup olmadigina bakar; is
 * yoksa hicbir islem/denetim satiri yazilmaz. Her kurum kendi isleminde calisir; biri patlarsa
 * digerleri etkilenmez. Idempotenttir.
 */
export async function dersKatilimcilariniEsitleSistem(
  db: Database | null,
  secenek: DersKatilimciEsitlemeSecenegi = {},
): Promise<DersKatilimciEsitlemeOzeti> {
  if (!db) throw new Error('DATABASE_SISTEM_URL tanımlı değil: katılımcılar eşitlenemez.');
  const simdi = secenek.simdi ?? new Date();
  const ozet: DersKatilimciEsitlemeOzeti = { kurum: 0, ders: 0, eklenen: 0, cikarilan: 0, hata: 0 };
  const baslangictan = new Date(simdi.getTime() - YOKLAMA_BEKLEYEN_GUN * 86_400_000);
  const adaylar = await esitlenecekDersler(db.orm, secenek.kurumId ?? null, baslangictan);
  const kurumlar = new Map<string, string[]>();
  for (const a of adaylar)
    kurumlar.set(a.kurum_id, [...(kurumlar.get(a.kurum_id) ?? []), a.ders_id]);

  for (const [kurumId, dersIdleri] of kurumlar) {
    try {
      await withSistem(
        db,
        {
          eylem: 'sistem.ders_katilimci_esitle',
          neden: 'Saatlik iş: ders katılımcı listelerini grup üyeliğiyle eşitle',
          kurumId,
          hedefTuru: 'kurum',
          hedefId: kurumId,
          ayrinti: { aday_ders_sayisi: dersIdleri.length },
        },
        async (tx) => {
          const sonuc = await dersKatilimcilariniEsitle(
            tx,
            kurumId,
            { dersIdleri },
            {
              kurumId,
              actor: { tur: 'sistem', id: 'ders-katilimci-isi' },
              correlationId: `ders-katilimci-isi-${uuidv7()}`,
            },
          );
          ozet.kurum++;
          ozet.ders += sonuc.degisenDersler;
          ozet.eklenen += sonuc.eklenen;
          ozet.cikarilan += sonuc.cikarilan;
        },
      );
    } catch (err) {
      ozet.hata++;
      secenek.log?.error({ err, kurum_id: kurumId }, 'ders katılımcıları eşitlenemedi');
    }
  }
  return ozet;
}

/** 14 gunden eski `yoklama_istekleri` satirlarini siler (yeniden deneme penceresi gecti). Silinen sayiyi doner. */
export async function eskiYoklamaIstekleriniSil(
  db: Database | null,
  secenek: DersSeriUretimSecenegi = {},
): Promise<number> {
  if (!db) throw new Error('DATABASE_SISTEM_URL tanımlı değil: yoklama istekleri temizlenemez.');
  const simdi = secenek.simdi ?? new Date();
  const sinir = new Date(simdi.getTime() - YOKLAMA_ISTEK_SAKLAMA_GUN * 86_400_000);
  const silinen = await db.orm.execute<{ id: string }>(
    sql`delete from ders.yoklama_istekleri where created_at < ${sinir.toISOString()}::timestamptz returning id`,
  );
  return silinen.length;
}

export interface DersSaatlikOzeti {
  seri: DersSeriUretimOzeti;
  katilimci: DersKatilimciEsitlemeOzeti;
  silinenYoklamaIstegi: number;
}

/** Worker'in saatlik cagrisi: seri uzatma, katilimci esitleme, eski istek temizligi. Her adim bagimsizdir. */
export async function dersSaatlikIs(
  db: Database | null,
  secenek: DersKatilimciEsitlemeSecenegi = {},
): Promise<DersSaatlikOzeti> {
  const seri = await dersSerileriniUret(db, secenek).catch((err: unknown) => {
    secenek.log?.error({ err }, 'ders serisi işi başarısız');
    return { kurum: 0, seri: 0, uretilen: 0, atlanan: 0, hata: 1 };
  });
  const katilimci = await dersKatilimcilariniEsitleSistem(db, secenek).catch((err: unknown) => {
    secenek.log?.error({ err }, 'ders katılımcı eşitleme işi başarısız');
    return { kurum: 0, ders: 0, eklenen: 0, cikarilan: 0, hata: 1 };
  });
  const silinenYoklamaIstegi = await eskiYoklamaIstekleriniSil(db, secenek).catch(
    (err: unknown) => {
      secenek.log?.error({ err }, 'yoklama istekleri temizlenemedi');
      return 0;
    },
  );
  return { seri, katilimci, silinenYoklamaIstegi };
}
