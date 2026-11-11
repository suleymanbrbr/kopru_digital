import { SORU_OTOMATIK_COZME_GUN, ogrenmeSoruCozulduV1 } from '@kopru/contracts';
import { publishInTx, type Database } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { withSistem } from './with-sistem.js';

/** `soru.cozuldu` olayinin `outbox` tablosu (api semasi). */
const OUTBOX_TABLOSU = 'ortak.outbox';
const PARTI = 200;
/** Kota sayaclari bu kadar gun saklanir. */
export const KOTA_SAYAC_SAKLAMA_GUN = 400;

export interface OtomatikCozmeOzeti {
  kurum: number;
  soru: number;
  hata: number;
}
export interface IsSecenegi {
  /** Testler icin; varsayilan: simdi. */
  simdi?: Date;
  log?: { error(nesne: unknown, mesaj: string): void };
}

/**
 * Saatlik is: `SORU_OTOMATIK_COZME_GUN` gundur `cevaplandi` durumunda, takipsiz kalan sorulari `cozuldu`
 * (kaynak `otomatik`) yapar ve `ogrenme.soru.cozuldu.v1` yayimlar (`silinecek_at` = simdi + kurumun
 * `foto_saklama_gun`). Kurumlar once yalniz OKUYAN sorguyla bulunur; her parti kendi isleminde `api_sistem`
 * ile calisir. Satirlar `FOR UPDATE SKIP LOCKED` ile secilir (coklu worker ayni soruyu iki kez islemez) ve
 * `durum = 'cevaplandi'` kosulu isi idempotent yapar.
 */
export async function soruOtomatikCoz(
  db: Database | null,
  secenek: IsSecenegi = {},
): Promise<OtomatikCozmeOzeti> {
  if (!db) throw new Error('DATABASE_SISTEM_URL tanımlı değil: sorular otomatik çözülemez.');
  const simdi = (secenek.simdi ?? new Date()).toISOString();
  const ozet: OtomatikCozmeOzeti = { kurum: 0, soru: 0, hata: 0 };
  const kurumlar = await db.orm.execute<{ kurum_id: string }>(sql`
    select distinct kurum_id from ogrenme.sorular
    where durum = 'cevaplandi'
      and son_hareket_at <= ${simdi}::timestamptz - make_interval(days => ${SORU_OTOMATIK_COZME_GUN}::int)`);

  for (const { kurum_id: kurumId } of kurumlar) {
    ozet.kurum++;
    try {
      for (;;) {
        const islenen = await withSistem(
          db,
          {
            eylem: 'sistem.soru_otomatik_coz',
            neden: 'Saatlik iş: 7 gündür cevaplanmış ve takipsiz soruları çözüldü yap',
            kurumId,
            hedefTuru: 'kurum',
            hedefId: kurumId,
          },
          async (tx) => {
            const satirlar = await tx.execute<{
              id: string;
              ogrenci_id: string;
              brans_kodu: string;
              cozuldu_at: Date | string;
              foto_silinme_at: Date | string;
            }>(sql`
              with aday as (
                select id from ogrenme.sorular
                where kurum_id = ${kurumId}::uuid and durum = 'cevaplandi'
                  and son_hareket_at <= ${simdi}::timestamptz - make_interval(days => ${SORU_OTOMATIK_COZME_GUN}::int)
                order by son_hareket_at, id limit ${PARTI} for update skip locked)
              update ogrenme.sorular s
              set durum = 'cozuldu', cozuldu_at = ${simdi}::timestamptz, cozuldu_kaynagi = 'otomatik',
                  son_hareket_at = ${simdi}::timestamptz,
                  foto_silinme_at = ${simdi}::timestamptz + make_interval(
                    days => coalesce((select a.foto_saklama_gun from ogrenme.soru_ayarlari a
                                      where a.kurum_id = s.kurum_id), 30)::int)
              from aday where s.id = aday.id
              returning s.id, s.ogrenci_id, s.brans_kodu, s.cozuldu_at, s.foto_silinme_at`);
            for (const s of satirlar) {
              const dosyalar = await tx.execute<{ id: string }>(sql`
                select medya_dosya_id as id from ogrenme.soru_dosyalari where soru_id = ${s.id}::uuid
                union
                select e.medya_dosya_id from ogrenme.soru_mesaj_ekleri e
                join ogrenme.soru_mesajlari m on m.id = e.mesaj_id where m.soru_id = ${s.id}::uuid`);
              await publishInTx(
                tx,
                ogrenmeSoruCozulduV1.create({
                  kurumId,
                  actor: { tur: 'sistem', id: 'soru_otomatik_cozme' },
                  correlationId: uuidv7(),
                  data: {
                    soru_id: s.id,
                    ogrenci_id: s.ogrenci_id,
                    brans_kodu: s.brans_kodu,
                    cozuldu_at: new Date(s.cozuldu_at).toISOString(),
                    dosya_idleri: dosyalar.map((d) => d.id),
                    silinecek_at: new Date(s.foto_silinme_at).toISOString(),
                  },
                }),
                { table: OUTBOX_TABLOSU },
              );
            }
            return satirlar.length;
          },
        );
        ozet.soru += islenen;
        if (islenen < PARTI) break;
      }
    } catch (err) {
      ozet.hata++;
      secenek.log?.error({ err, kurum_id: kurumId }, 'sorular otomatik çözülemedi');
    }
  }
  return ozet;
}

/** 400 gunden eski kota sayaclarini siler (tum kiracilar; sistem rolu). Silinen sayiyi dondurur. */
export async function soruKotaSayaclariniTemizle(
  db: Database | null,
  secenek: IsSecenegi = {},
): Promise<number> {
  const simdi = (secenek.simdi ?? new Date()).toISOString();
  return withSistem(
    db,
    {
      eylem: 'sistem.soru_kota_temizle',
      neden: `Günlük iş: ${String(KOTA_SAYAC_SAKLAMA_GUN)} günden eski soru kota sayaçlarını sil`,
    },
    async (tx) => {
      const silinen = await tx.execute(sql`
        delete from ogrenme.soru_kota_sayaclari
        where donem < (${simdi}::timestamptz)::date - ${KOTA_SAYAC_SAKLAMA_GUN}::int returning 1`);
      return silinen.length;
    },
  );
}
