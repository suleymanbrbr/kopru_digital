import {
  errorCodes,
  finansHataKodlari,
  finansTahsilatAlindiV1,
  IptalGirdiSema,
  KurumParamSema,
  TahsilatBaslikSema,
  TahsilatGirdiSema,
  TahsilatListeSorguSema,
  TahsilatListeYanitSema,
  TahsilatSema,
  TahsilatYanitSema,
  type TahsilatGirdi,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { and, desc, eq, inArray, lt, sql, type SQL } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import { bakiyeHareketleri, paketSatislari, tahsilatlar, uyelikler } from '../../db/schema.js';
import { requirePermission, type YetkiBaglami } from '../hesap/index.js';
import { bakiyeSatiriYaz, bakiyeTersiYok } from './defter.js';
import {
  ayAraligi,
  bugunIstanbul,
  denetimYaz,
  kiraci,
  ogrenciBul,
  ogrenciKapsami,
  olayYaz,
  yetkiAl,
} from './ortak.js';

export type TahsilatSatiri = typeof tahsilatlar.$inferSelect;

export const tahsilatYaniti = (t: TahsilatSatiri): z.infer<typeof TahsilatSema> => ({
  id: t.id,
  ogrenci_id: t.ogrenci_id,
  tutar_kurus: t.tutar_kurus,
  yontem: t.yontem as z.infer<typeof TahsilatSema>['yontem'],
  tahsilat_tarihi: t.tahsilat_tarihi,
  makbuz_no: t.makbuz_no,
  paket_satisi_id: t.paket_satisi_id,
  aciklama: t.aciklama,
  alan_id: t.alan_id,
  durum: t.durum as 'gecerli' | 'iptal',
  iptal_at: t.iptal_at?.toISOString() ?? null,
  iptal_nedeni: t.iptal_nedeni,
  created_at: t.created_at.toISOString(),
});

const odemeGecersiz = (mesaj: string) => new AppError(422, finansHataKodlari.odemeGecersiz, mesaj);

export interface TahsilatKaydetGirdi extends Omit<TahsilatGirdi, 'tahsilat_tarihi'> {
  tahsilat_tarihi: string;
  istek_id: string | null;
}

/**
 * Tahsilat satiri + `tahsilat` bakiye satiri + `finans.tahsilat.alindi.v1` olayi (tek islem).
 * `istek_id` ayni kurumda ikinci kez gelirse yeni kayit olusmaz: onceki kayit `tekrar: true` ile
 * doner; ayni anahtarla farkli icerik 409 `istek_cakismasi`.
 */
export async function tahsilatKaydet(
  tx: Tx,
  y: YetkiBaglami,
  correlationId: string,
  g: TahsilatKaydetGirdi,
): Promise<{ satir: TahsilatSatiri; tekrar: boolean }> {
  if (g.tahsilat_tarihi > bugunIstanbul()) throw odemeGecersiz('Tahsilat tarihi gelecekte olamaz.');
  if (g.paket_satisi_id) {
    const [satis] = await tx
      .select({ ogrenci_id: paketSatislari.ogrenci_id })
      .from(paketSatislari)
      .where(and(eq(paketSatislari.id, g.paket_satisi_id), eq(paketSatislari.kurum_id, y.kurumId)));
    if (satis?.ogrenci_id !== g.ogrenci_id) {
      throw new AppError(404, errorCodes.notFound, 'Paket satışı bulunamadı.');
    }
  }
  const id = uuidv7();
  const eklenen = await tx
    .insert(tahsilatlar)
    .values({
      id,
      kurum_id: y.kurumId,
      created_by: y.kullaniciId,
      ogrenci_id: g.ogrenci_id,
      tutar_kurus: g.tutar_kurus,
      yontem: g.yontem,
      tahsilat_tarihi: g.tahsilat_tarihi,
      makbuz_no: g.makbuz_no ?? null,
      paket_satisi_id: g.paket_satisi_id ?? null,
      aciklama: g.aciklama ?? null,
      alan_id: y.uyelikId,
      istek_id: g.istek_id,
    })
    .onConflictDoNothing()
    .returning();
  const satir = eklenen[0];
  if (!satir) {
    if (g.istek_id) {
      const [onceki] = await tx
        .select()
        .from(tahsilatlar)
        .where(and(eq(tahsilatlar.kurum_id, y.kurumId), eq(tahsilatlar.istek_id, g.istek_id)));
      if (onceki) {
        if (
          onceki.ogrenci_id !== g.ogrenci_id ||
          onceki.tutar_kurus !== g.tutar_kurus ||
          onceki.yontem !== g.yontem
        ) {
          throw new AppError(
            409,
            finansHataKodlari.istekCakismasi,
            'Bu Idempotency-Key başka bir tahsilat için kullanılmış.',
          );
        }
        return { satir: onceki, tekrar: true };
      }
    }
    throw new AppError(
      409,
      finansHataKodlari.makbuzNoKullanimda,
      'Bu makbuz numarası zaten kullanılıyor.',
    );
  }
  await bakiyeSatiriYaz(tx, {
    kurumId: y.kurumId,
    ogrenciId: g.ogrenci_id,
    tur: 'tahsilat',
    tutarKurus: g.tutar_kurus,
    kaynakTuru: 'tahsilat',
    kaynakId: satir.id,
    aktorKullaniciId: y.kullaniciId,
  });
  await olayYaz(
    tx,
    finansTahsilatAlindiV1.create({
      kurumId: y.kurumId,
      actor: { tur: 'kullanici', id: y.kullaniciId },
      correlationId,
      data: {
        tahsilat_id: satir.id,
        ogrenci_id: satir.ogrenci_id,
        tutar_kurus: satir.tutar_kurus,
        yontem: g.yontem,
        tahsilat_tarihi: satir.tahsilat_tarihi,
        makbuz_no: satir.makbuz_no,
      },
    }),
  );
  return { satir, tekrar: false };
}

const tahsilatParam = KurumParamSema.extend({ tahsilat_id: z.uuid() });

/** `/v1/finans/kurumlar/:kurum_id/tahsilatlar`: tahsilat olusturma, iptal ve liste. */
export const tahsilatYollari: ServicePlugin = (app) => {
  const db = () => {
    if (!app.db) throw new AppError(503, errorCodes.unavailable, 'Veritabanı kullanılamıyor.');
    return app.db;
  };

  app.post(
    '/kurumlar/:kurum_id/tahsilatlar',
    {
      preHandler: requirePermission('finans.tahsilat.yaz', { scope: 'grup' }),
      schema: {
        tags: ['finans'],
        summary:
          'Tahsilat al. `Idempotency-Key` (UUID) basligi ayni istegin ikinci kez cift kayit olusturmasini onler (tekrar: true).',
        params: KurumParamSema,
        headers: TahsilatBaslikSema,
        body: TahsilatGirdiSema,
        response: { 200: TahsilatYanitSema, 201: TahsilatYanitSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const b = request.body;
      const istekId = request.headers['idempotency-key'] ?? null;
      const sonuc = await withTenant(db(), kiraci(y), async (tx) => {
        await ogrenciBul(tx, y, b.ogrenci_id);
        const kayit = await tahsilatKaydet(tx, y, request.correlationId, {
          ...b,
          tahsilat_tarihi: b.tahsilat_tarihi ?? bugunIstanbul(),
          istek_id: istekId,
        });
        if (!kayit.tekrar) {
          await denetimYaz(tx, y, request.ip, {
            eylem: 'finans.tahsilat.alindi',
            hedefTuru: 'tahsilat',
            hedefId: kayit.satir.id,
            sonra: {
              ogrenci_id: kayit.satir.ogrenci_id,
              tutar_kurus: kayit.satir.tutar_kurus,
              yontem: kayit.satir.yontem,
            },
            istekId,
          });
        }
        return kayit;
      });
      return reply
        .status(sonuc.tekrar ? 200 : 201)
        .send({ ...tahsilatYaniti(sonuc.satir), tekrar: sonuc.tekrar });
    },
  );

  app.post(
    '/kurumlar/:kurum_id/tahsilatlar/:tahsilat_id/iptal',
    {
      preHandler: requirePermission('finans.tahsilat.yaz', { scope: 'grup' }),
      schema: {
        tags: ['finans'],
        summary:
          'Tahsilati iptal et (ters kayit). Neden zorunludur; iptal tek yonludur ve iptalin iptali yoktur.',
        params: tahsilatParam,
        body: IptalGirdiSema,
        response: { 200: TahsilatSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { tahsilat_id } = request.params;
      const { neden } = request.body;
      const satir = await withTenant(db(), kiraci(y), async (tx) => {
        const [mevcut] = await tx
          .select()
          .from(tahsilatlar)
          .where(and(eq(tahsilatlar.id, tahsilat_id), eq(tahsilatlar.kurum_id, y.kurumId)))
          .for('update');
        if (!mevcut) throw new AppError(404, errorCodes.notFound, 'Tahsilat bulunamadı.');
        await ogrenciBul(tx, y, mevcut.ogrenci_id);
        if (mevcut.durum === 'iptal') {
          throw new AppError(409, finansHataKodlari.tahsilatIptal, 'Tahsilat zaten iptal edilmiş.');
        }
        const [orijinal] = await tx
          .select()
          .from(bakiyeHareketleri)
          .where(
            and(
              eq(bakiyeHareketleri.kurum_id, y.kurumId),
              eq(bakiyeHareketleri.tur, 'tahsilat'),
              eq(bakiyeHareketleri.kaynak_id, mevcut.id),
              bakiyeTersiYok,
            ),
          );
        if (!orijinal) throw new Error('tahsilat defter satırı bulunamadı');
        await bakiyeSatiriYaz(tx, {
          kurumId: y.kurumId,
          ogrenciId: mevcut.ogrenci_id,
          tur: 'ters_kayit',
          tutarKurus: -orijinal.tutar_kurus,
          kaynakTuru: 'tahsilat',
          kaynakId: mevcut.id,
          tersCevrilenId: orijinal.id,
          neden,
          aktorKullaniciId: y.kullaniciId,
        });
        const [guncel] = await tx
          .update(tahsilatlar)
          .set({ durum: 'iptal', iptal_at: sql`now()`, iptal_nedeni: neden })
          .where(eq(tahsilatlar.id, mevcut.id))
          .returning();
        if (!guncel) throw new Error('tahsilat güncellenemedi');
        await denetimYaz(tx, y, request.ip, {
          eylem: 'finans.tahsilat.iptal',
          hedefTuru: 'tahsilat',
          hedefId: mevcut.id,
          once: { durum: 'gecerli' },
          sonra: { durum: 'iptal', tutar_kurus: mevcut.tutar_kurus },
          neden,
        });
        return guncel;
      });
      return tahsilatYaniti(satir);
    },
  );

  app.get(
    '/kurumlar/:kurum_id/tahsilatlar',
    {
      preHandler: requirePermission('finans.oku', { scope: 'grup' }),
      schema: {
        tags: ['finans'],
        summary: 'Tahsilatlari listele (yeniden eskiye); kapsam rolun izin kapsamina gore daralir.',
        params: KurumParamSema,
        querystring: TahsilatListeSorguSema,
        response: { 200: TahsilatListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { ogrenci_id, ay, durum, limit, imlec } = request.query;
      return withTenant(db(), kiraci(y), async (tx) => {
        const kosullar: (SQL | undefined)[] = [eq(tahsilatlar.kurum_id, y.kurumId)];
        const kapsam = ogrenciKapsami(tx, y);
        if (kapsam) {
          kosullar.push(
            inArray(
              tahsilatlar.ogrenci_id,
              tx.select({ id: uyelikler.id }).from(uyelikler).where(kapsam),
            ),
          );
        }
        if (ogrenci_id) kosullar.push(eq(tahsilatlar.ogrenci_id, ogrenci_id));
        if (durum !== 'hepsi') kosullar.push(eq(tahsilatlar.durum, durum));
        if (ay) {
          const { baslangic, sonraki } = ayAraligi(ay);
          kosullar.push(
            sql`${tahsilatlar.tahsilat_tarihi} >= ${baslangic}::date and ${tahsilatlar.tahsilat_tarihi} < ${sonraki}::date`,
          );
        }
        if (imlec) kosullar.push(lt(tahsilatlar.id, imlec));
        const satirlar = await tx
          .select()
          .from(tahsilatlar)
          .where(and(...kosullar))
          .orderBy(desc(tahsilatlar.id))
          .limit(limit + 1);
        const sayfa = satirlar.slice(0, limit);
        return {
          kapsam: y.kapsam,
          tahsilatlar: sayfa.map(tahsilatYaniti),
          sonraki_imlec: satirlar.length > limit ? (sayfa.at(-1)?.id ?? null) : null,
        };
      });
    },
  );
  return Promise.resolve();
};
