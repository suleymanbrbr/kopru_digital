import {
  BakiyeHareketListeYanitSema,
  errorCodes,
  FinansOgrenciListeSorguSema,
  FinansOgrenciListeYanitSema,
  FinansProfiliSema,
  FinansProfiliYazGirdiSema,
  HareketSorguSema,
  KrediHareketListeYanitSema,
  OgrenciFinansYanitSema,
  OgrenciParamSema,
  KurumParamSema,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { and, asc, desc, eq, lt, gt, sql, type SQL } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { z } from 'zod';

import {
  bakiyeHareketleri,
  krediBakiyeleri,
  krediHareketleri,
  kurumlar,
  ogrenciBakiyeleri,
  ogrenciFinansProfilleri,
  paketSatislari,
  uyelikler,
} from '../../db/schema.js';
import { requirePermission, type YetkiBaglami } from '../hesap/index.js';
import { havuzKalan } from './defter.js';
import { kurumPolitikasiGetir } from './kredi-uygula.js';
import {
  denetimYaz,
  kalanDersGorunsunMu,
  kiraci,
  likeKacir,
  ogrenciBul,
  ogrenciKapsami,
  yetkiAl,
} from './ortak.js';
import { satisYaniti } from './paket.js';

type Model = 'paket' | 'ders_basi' | 'yok';

type KrediHareketYaniti = z.infer<typeof KrediHareketListeYanitSema>['hareketler'][number];
type BakiyeHareketYaniti = z.infer<typeof BakiyeHareketListeYanitSema>['hareketler'][number];

const krediHareketiYaniti = (h: typeof krediHareketleri.$inferSelect): KrediHareketYaniti => ({
  id: h.id,
  tur: h.tur as KrediHareketYaniti['tur'],
  miktar: h.miktar,
  paket_satisi_id: h.paket_satisi_id,
  ders_id: h.ders_id,
  yoklama_id: h.yoklama_id,
  yoklama_surumu: h.yoklama_surumu,
  ters_cevrilen_id: h.ters_cevrilen_id,
  neden: h.neden,
  created_at: h.created_at.toISOString(),
});

const bakiyeHareketiYaniti = (h: typeof bakiyeHareketleri.$inferSelect): BakiyeHareketYaniti => ({
  id: h.id,
  tur: h.tur as BakiyeHareketYaniti['tur'],
  tutar_kurus: h.tutar_kurus,
  kaynak_turu: h.kaynak_turu as BakiyeHareketYaniti['kaynak_turu'],
  kaynak_id: h.kaynak_id,
  ders_id: h.ders_id,
  yoklama_id: h.yoklama_id,
  ters_cevrilen_id: h.ters_cevrilen_id,
  neden: h.neden,
  created_at: h.created_at.toISOString(),
});

async function bakiyeler(tx: Tx, kurumId: string, ogrenciId: string) {
  const [kb] = await tx
    .select({ bakiye: krediBakiyeleri.bakiye })
    .from(krediBakiyeleri)
    .where(and(eq(krediBakiyeleri.kurum_id, kurumId), eq(krediBakiyeleri.ogrenci_id, ogrenciId)));
  const [ob] = await tx
    .select({ bakiye: ogrenciBakiyeleri.bakiye_kurus })
    .from(ogrenciBakiyeleri)
    .where(
      and(eq(ogrenciBakiyeleri.kurum_id, kurumId), eq(ogrenciBakiyeleri.ogrenci_id, ogrenciId)),
    );
  return { kredi: kb?.bakiye ?? 0, kurus: ob?.bakiye ?? 0 };
}

async function profilGetir(tx: Tx, kurumId: string, ogrenciId: string) {
  const [p] = await tx
    .select()
    .from(ogrenciFinansProfilleri)
    .where(
      and(
        eq(ogrenciFinansProfilleri.kurum_id, kurumId),
        eq(ogrenciFinansProfilleri.ogrenci_id, ogrenciId),
      ),
    );
  return p;
}

const modelOlarak = (m: string | undefined): Model =>
  m === 'paket' || m === 'ders_basi' ? m : 'yok';

/** `/v1/finans/kurumlar/:kurum_id/ogrenciler...`: ogrenci karti, profil, hareketler ve liste. */
export const ogrenciYollari: ServicePlugin = (app) => {
  const db = () => {
    if (!app.db) throw new AppError(503, errorCodes.unavailable, 'Veritabanı kullanılamıyor.');
    return app.db;
  };
  const personel = requirePermission('finans.oku', { scope: 'grup' });

  app.get(
    '/kurumlar/:kurum_id/ogrenciler/:ogrenci_id/finans',
    {
      preHandler: requirePermission('finans.oku'),
      schema: {
        tags: ['finans'],
        summary:
          'Ogrenci finans karti. Personel (`gorunum: tam`): kalan kredi, bakiye, etkin paketler, son hareketler, odeyen. Ogrenci rolu (`gorunum: ogrenci`): yalniz kendi kalan dersi; kurum ayari kapaliysa `kalan_kredi: null`. Fiyat/borc/tahsilat ogrenciye donmez.',
        params: OgrenciParamSema,
        response: { 200: OgrenciFinansYanitSema },
      },
    },
    async (request): Promise<z.infer<typeof OgrenciFinansYanitSema>> => {
      const y = yetkiAl(request);
      const { ogrenci_id } = request.params;
      return withTenant(db(), kiraci(y), async (tx) => {
        await ogrenciBul(tx, y, ogrenci_id);
        const b = await bakiyeler(tx, y.kurumId, ogrenci_id);
        if (y.rol === 'ogrenci') {
          const [kurum] = await tx
            .select({ ayarlar: kurumlar.ayarlar })
            .from(kurumlar)
            .where(eq(kurumlar.id, y.kurumId));
          return {
            gorunum: 'ogrenci',
            ogrenci_id,
            kalan_kredi: kalanDersGorunsunMu(kurum?.ayarlar) ? b.kredi : null,
          };
        }
        const profil = await profilGetir(tx, y.kurumId, ogrenci_id);
        const politika = await kurumPolitikasiGetir(tx, y.kurumId);
        const paketler = await tx
          .select()
          .from(paketSatislari)
          .where(
            and(
              eq(paketSatislari.kurum_id, y.kurumId),
              eq(paketSatislari.ogrenci_id, ogrenci_id),
              eq(paketSatislari.durum, 'aktif'),
            ),
          )
          .orderBy(asc(sql`${paketSatislari.bitis_tarihi} nulls last`), asc(paketSatislari.id));
        const krediSon = await tx
          .select()
          .from(krediHareketleri)
          .where(
            and(
              eq(krediHareketleri.kurum_id, y.kurumId),
              eq(krediHareketleri.ogrenci_id, ogrenci_id),
            ),
          )
          .orderBy(desc(krediHareketleri.id))
          .limit(10);
        const bakiyeSon = await tx
          .select()
          .from(bakiyeHareketleri)
          .where(
            and(
              eq(bakiyeHareketleri.kurum_id, y.kurumId),
              eq(bakiyeHareketleri.ogrenci_id, ogrenci_id),
            ),
          )
          .orderBy(desc(bakiyeHareketleri.id))
          .limit(10);
        const etkin = [];
        for (const p of paketler) etkin.push(satisYaniti(p, await havuzKalan(tx, y.kurumId, p.id)));
        return {
          gorunum: 'tam',
          ogrenci_id,
          model: modelOlarak(profil?.model),
          kalan_kredi: b.kredi,
          dusuk_kredi_esigi: politika.dusuk_kredi_esigi,
          bakiye_kurus: b.kurus,
          borclu: b.kurus < 0,
          etkin_paketler: etkin,
          son_kredi_hareketleri: krediSon.map(krediHareketiYaniti),
          son_bakiye_hareketleri: bakiyeSon.map(bakiyeHareketiYaniti),
          odeyen_ad: profil?.odeyen_ad ?? null,
          odeyen_telefon: profil?.odeyen_telefon ?? null,
        };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/ogrenciler/:ogrenci_id/finans-profili',
    {
      preHandler: personel,
      schema: {
        tags: ['finans'],
        summary: 'Ogrencinin faturalama modeli ve odeyen kisi (duz bilgi).',
        params: OgrenciParamSema,
        response: { 200: FinansProfiliSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { ogrenci_id } = request.params;
      return withTenant(db(), kiraci(y), async (tx) => {
        await ogrenciBul(tx, y, ogrenci_id);
        const p = await profilGetir(tx, y.kurumId, ogrenci_id);
        return {
          ogrenci_id,
          model: modelOlarak(p?.model),
          odeyen_ad: p?.odeyen_ad ?? null,
          odeyen_telefon: p?.odeyen_telefon ?? null,
          surum: p?.surum ?? null,
        };
      });
    },
  );

  app.put(
    '/kurumlar/:kurum_id/ogrenciler/:ogrenci_id/finans-profili',
    {
      preHandler: requirePermission('finans.tahsilat.yaz', { scope: 'grup' }),
      schema: {
        tags: ['finans'],
        summary:
          'Faturalama modelini (paket, ders_basi, yok) ve odeyen kisiyi yaz. Verilmeyen alanlar degismez; odeyen bilgisi denetim kaydina, olaya ve loga girmez.',
        params: OgrenciParamSema,
        body: FinansProfiliYazGirdiSema,
        response: { 200: FinansProfiliSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { ogrenci_id } = request.params;
      const b = request.body;
      return withTenant(db(), kiraci(y), async (tx) => {
        await ogrenciBul(tx, y, ogrenci_id);
        const [onceki] = await tx
          .select({ id: ogrenciFinansProfilleri.id })
          .from(ogrenciFinansProfilleri)
          .where(
            and(
              eq(ogrenciFinansProfilleri.kurum_id, y.kurumId),
              eq(ogrenciFinansProfilleri.ogrenci_id, ogrenci_id),
            ),
          )
          .for('update');
        const degisen = {
          ...(b.model !== undefined ? { model: b.model } : {}),
          ...(b.odeyen_ad !== undefined ? { odeyen_ad: b.odeyen_ad } : {}),
          ...(b.odeyen_telefon !== undefined ? { odeyen_telefon: b.odeyen_telefon } : {}),
        };
        let satir;
        if (onceki) {
          [satir] = await tx
            .update(ogrenciFinansProfilleri)
            .set(degisen)
            .where(eq(ogrenciFinansProfilleri.id, onceki.id))
            .returning();
        } else {
          [satir] = await tx
            .insert(ogrenciFinansProfilleri)
            .values({
              id: uuidv7(),
              kurum_id: y.kurumId,
              created_by: y.kullaniciId,
              ogrenci_id,
              ...degisen,
            })
            .returning();
        }
        if (!satir) throw new Error('profil yazılamadı');
        await denetimYaz(tx, y, request.ip, {
          eylem: 'finans.profil.guncellendi',
          hedefTuru: 'ogrenci_finans_profili',
          hedefId: satir.id,
          // Odeyen kisi bilgisi degerleriyle yazilmaz: yalniz degisen alan adlari.
          sonra: { alanlar: Object.keys(degisen), ...(b.model ? { model: b.model } : {}) },
        });
        return {
          ogrenci_id,
          model: modelOlarak(satir.model),
          odeyen_ad: satir.odeyen_ad,
          odeyen_telefon: satir.odeyen_telefon,
          surum: satir.surum,
        };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/ogrenciler/:ogrenci_id/kredi-hareketleri',
    {
      preHandler: personel,
      schema: {
        tags: ['finans'],
        summary: 'Kredi defteri satirlari (yeniden eskiye, sayfali).',
        params: OgrenciParamSema,
        querystring: HareketSorguSema,
        response: { 200: KrediHareketListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { ogrenci_id } = request.params;
      const { limit, imlec } = request.query;
      return withTenant(db(), kiraci(y), async (tx) => {
        await ogrenciBul(tx, y, ogrenci_id);
        const kosullar = [
          eq(krediHareketleri.kurum_id, y.kurumId),
          eq(krediHareketleri.ogrenci_id, ogrenci_id),
        ];
        if (imlec) kosullar.push(lt(krediHareketleri.id, imlec));
        const satirlar = await tx
          .select()
          .from(krediHareketleri)
          .where(and(...kosullar))
          .orderBy(desc(krediHareketleri.id))
          .limit(limit + 1);
        const sayfa = satirlar.slice(0, limit);
        return {
          hareketler: sayfa.map(krediHareketiYaniti),
          kalan_kredi: (await bakiyeler(tx, y.kurumId, ogrenci_id)).kredi,
          sonraki_imlec: satirlar.length > limit ? (sayfa.at(-1)?.id ?? null) : null,
        };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/ogrenciler/:ogrenci_id/bakiye-hareketleri',
    {
      preHandler: personel,
      schema: {
        tags: ['finans'],
        summary:
          'Bakiye defteri satirlari (yeniden eskiye, sayfali). Negatif bakiye = ogrenci borclu.',
        params: OgrenciParamSema,
        querystring: HareketSorguSema,
        response: { 200: BakiyeHareketListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { ogrenci_id } = request.params;
      const { limit, imlec } = request.query;
      return withTenant(db(), kiraci(y), async (tx) => {
        await ogrenciBul(tx, y, ogrenci_id);
        const kosullar = [
          eq(bakiyeHareketleri.kurum_id, y.kurumId),
          eq(bakiyeHareketleri.ogrenci_id, ogrenci_id),
        ];
        if (imlec) kosullar.push(lt(bakiyeHareketleri.id, imlec));
        const satirlar = await tx
          .select()
          .from(bakiyeHareketleri)
          .where(and(...kosullar))
          .orderBy(desc(bakiyeHareketleri.id))
          .limit(limit + 1);
        const sayfa = satirlar.slice(0, limit);
        return {
          hareketler: sayfa.map(bakiyeHareketiYaniti),
          bakiye_kurus: (await bakiyeler(tx, y.kurumId, ogrenci_id)).kurus,
          sonraki_imlec: satirlar.length > limit ? (sayfa.at(-1)?.id ?? null) : null,
        };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/ogrenciler',
    {
      preHandler: personel,
      schema: {
        tags: ['finans'],
        summary:
          'Ogrenci finans listesi (kalan ders rozeti icin `kalan_kredi` ve esik). `?borclu` ve `?dusuk_kredi` suzgecleri; kapsam rolun izin kapsamina gore daralir.',
        params: KurumParamSema,
        querystring: FinansOgrenciListeSorguSema,
        response: { 200: FinansOgrenciListeYanitSema },
      },
    },
    async (request) => {
      const y: YetkiBaglami = yetkiAl(request);
      const { borclu, dusuk_kredi, q, limit, imlec } = request.query;
      return withTenant(db(), kiraci(y), async (tx) => {
        const politika = await kurumPolitikasiGetir(tx, y.kurumId);
        const esik = politika.dusuk_kredi_esigi;
        const model = sql<string>`coalesce(${ogrenciFinansProfilleri.model}, 'yok')`;
        const kalan = sql<number>`coalesce(${krediBakiyeleri.bakiye}, 0)`.mapWith(Number);
        const bakiye = sql<number>`coalesce(${ogrenciBakiyeleri.bakiye_kurus}, 0)`.mapWith(Number);
        const dusukKosul = sql`(${model} = 'paket' and coalesce(${krediBakiyeleri.bakiye}, 0) <= ${esik})`;
        const kosullar: (SQL | undefined)[] = [
          eq(uyelikler.kurum_id, y.kurumId),
          eq(uyelikler.rol, 'ogrenci'),
          eq(uyelikler.durum, 'aktif'),
          ogrenciKapsami(tx, y),
        ];
        if (borclu !== undefined) {
          kosullar.push(borclu ? sql`${bakiye} < 0` : sql`${bakiye} >= 0`);
        }
        if (dusuk_kredi !== undefined)
          kosullar.push(dusuk_kredi ? dusukKosul : sql`not ${dusukKosul}`);
        if (q) kosullar.push(sql`${uyelikler.gorunen_ad} ilike ${`%${likeKacir(q)}%`}`);
        if (imlec) kosullar.push(gt(uyelikler.id, imlec));
        const satirlar = await tx
          .select({
            ogrenci_id: uyelikler.id,
            gorunen_ad: uyelikler.gorunen_ad,
            model,
            kalan,
            bakiye,
            dusuk: sql<boolean>`${dusukKosul}`,
          })
          .from(uyelikler)
          .leftJoin(
            ogrenciFinansProfilleri,
            and(
              eq(ogrenciFinansProfilleri.kurum_id, uyelikler.kurum_id),
              eq(ogrenciFinansProfilleri.ogrenci_id, uyelikler.id),
            ),
          )
          .leftJoin(
            krediBakiyeleri,
            and(
              eq(krediBakiyeleri.kurum_id, uyelikler.kurum_id),
              eq(krediBakiyeleri.ogrenci_id, uyelikler.id),
            ),
          )
          .leftJoin(
            ogrenciBakiyeleri,
            and(
              eq(ogrenciBakiyeleri.kurum_id, uyelikler.kurum_id),
              eq(ogrenciBakiyeleri.ogrenci_id, uyelikler.id),
            ),
          )
          .where(and(...kosullar))
          .orderBy(asc(uyelikler.id))
          .limit(limit + 1);
        const sayfa = satirlar.slice(0, limit);
        return {
          kapsam: y.kapsam,
          dusuk_kredi_esigi: esik,
          ogrenciler: sayfa.map((s) => ({
            ogrenci_id: s.ogrenci_id,
            gorunen_ad: s.gorunen_ad,
            model: modelOlarak(s.model),
            kalan_kredi: s.kalan,
            dusuk_kredi: s.dusuk,
            bakiye_kurus: s.bakiye,
            borclu: s.bakiye < 0,
          })),
          sonraki_imlec: satirlar.length > limit ? (sayfa.at(-1)?.ogrenci_id ?? null) : null,
        };
      });
    },
  );
  return Promise.resolve();
};
