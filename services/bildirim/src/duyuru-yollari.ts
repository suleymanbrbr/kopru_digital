import {
  DUYURU_LISTE_VARSAYILAN,
  DuyuruAliciListesiSema,
  DuyuruAliciSorguSema,
  DuyuruDetaySema,
  DuyuruGuncelleSema,
  DuyuruOkunduYanitiSema,
  DuyuruOkuyanlarSema,
  DuyuruOkuyanlarSorguSema,
  DuyuruOlusturSema,
  DuyuruSema,
  DuyuruSilYanitiSema,
  DuyuruYonetimListesiSema,
  DuyuruYonetimSorguSema,
  duyuruKurumYolParamSema,
  duyuruYolParamSema,
  errorCodes,
  izinVarMi,
  type DuyuruHedefTuru,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import {
  DUYURU_KOLONLARI,
  duyuruKilitle,
  duyuruYayinla,
  hedefYetkisi,
  hedefiDogrula,
  kurumBugunu,
  kutuGecerliligiAyarla,
  okunduIsaretle,
  yonetebilirMi,
  yoneticiMi,
  type DuyuruKimligi,
  type DuyuruSatiri,
} from './duyuru.js';
import { kimlik } from './kimlik.js';
import { iso, yeniId } from './ortak.js';

const metinDizisi = (d: readonly string[]) =>
  sql`array[${sql.join(
    d.map((x) => sql`${x}`),
    sql`, `,
  )}]::text[]`;

interface DuyuruAliciSatiri extends Record<string, unknown> {
  id: string;
  baslik: string;
  govde: string;
  hedef_turu: DuyuruHedefTuru;
  hedef_id: string;
  yazar_id: string;
  sabit: boolean;
  yayin_at: string;
  bitis_at: string | null;
  okundu_at: string | null;
}

/** Duyuru uclari (`/v1/bildirim/kurumlar/:kurum_id/duyurular...`). */
export function duyuruYollari(secenek: { simdi: () => Date }): ServicePlugin {
  return (app) => {
    const { db } = app;
    if (!db) return Promise.resolve();

    const baglam = (k: DuyuruKimligi & { kullaniciId: string }) => ({
      kurumId: k.kurumId,
      kullaniciId: k.kullaniciId,
      roller: [k.rol],
    });
    const okuyabilir = (k: DuyuruKimligi) => {
      if (!izinVarMi(k.rol, 'duyuru.oku')) {
        throw new AppError(403, errorCodes.izinYok, 'Duyuruları görme yetkiniz yok.');
      }
    };
    const yazabilir = (k: DuyuruKimligi) => {
      if (!izinVarMi(k.rol, 'duyuru.yaz', 'grup')) {
        throw new AppError(403, errorCodes.izinYok, 'Duyuru yazma yetkiniz yok.');
      }
    };
    const gorunmez = () => new AppError(404, errorCodes.notFound, 'Duyuru bulunamadı.');
    const tarih = (s: string | null | undefined) => (s ? new Date(s).toISOString() : null);

    const yol = '/v1/bildirim/kurumlar/:kurum_id/duyurular';

    // --- Yazar / yonetici -------------------------------------------------------------------

    app.post(
      yol,
      {
        schema: {
          tags: ['bildirim'],
          summary:
            'Duyuru taslagi olusturur. Ogretmen yalniz atandigi gruba; yonetici/sahip her hedefe yazar. Yayin ayri uctadir.',
          params: duyuruKurumYolParamSema,
          body: DuyuruOlusturSema,
          response: { 201: DuyuruSema },
        },
      },
      async (request, reply) => {
        const k = kimlik(request, request.params.kurum_id);
        yazabilir(k);
        const b = request.body;
        const hedefId = b.hedef_turu === 'kurum' ? (b.hedef_id ?? k.kurumId) : (b.hedef_id ?? '');
        const an = secenek.simdi();
        const satir = await withTenant(db, baglam(k), async (tx) => {
          await hedefiDogrula(tx, k.kurumId, b.hedef_turu, hedefId);
          await hedefYetkisi(tx, k, b.hedef_turu, hedefId, await kurumBugunu(tx, k.kurumId, an));
          const [d] = await tx.execute<DuyuruSatiri>(sql`
            insert into bildirim.duyurular
              (id, kurum_id, baslik, govde, hedef_turu, hedef_id, hedef_roller, yazar_id, bitis_at, sabit,
               push_gonderildi, created_by)
            values (${yeniId()}, ${k.kurumId}, ${b.baslik}, ${b.govde}, ${b.hedef_turu}, ${hedefId},
                    ${metinDizisi(b.hedef_roller)}, ${k.uyelikId}, ${tarih(b.bitis_at)}::timestamptz, ${b.sabit},
                    ${b.push_gonderildi}, ${k.kullaniciId})
            returning ${DUYURU_KOLONLARI}`);
          return d;
        });
        if (!satir) throw new Error('duyuru yazilamadi');
        return reply.code(201).send(satir);
      },
    );

    app.get(
      `${yol}/yonetim`,
      {
        schema: {
          tags: ['bildirim'],
          summary:
            'Yazar/yonetici listesi (alici ve okunan sayisiyla). Ogretmen yalniz kendi duyurularini, yonetici/sahip kurumun tumunu gorur.',
          params: duyuruKurumYolParamSema,
          querystring: DuyuruYonetimSorguSema,
          response: { 200: DuyuruYonetimListesiSema },
        },
      },
      async (request) => {
        const k = kimlik(request, request.params.kurum_id);
        yazabilir(k);
        const { durum, limit, offset } = request.query;
        const n = limit ?? DUYURU_LISTE_VARSAYILAN;
        const sorgu = sql`
          kurum_id = ${k.kurumId} and silindi_at is null
          ${yoneticiMi(k.rol) ? sql`` : sql`and yazar_id = ${k.uyelikId}`}
          ${durum ? sql`and durum = ${durum}` : sql``}`;
        return withTenant(db, baglam(k), async (tx) => {
          const satirlar = await tx.execute<DuyuruSatiri>(sql`
            select ${DUYURU_KOLONLARI} from bildirim.duyurular where ${sorgu}
             order by coalesce(yayin_at, created_at) desc, id desc limit ${n} offset ${offset ?? 0}`);
          const [t] = await tx.execute<{ n: number }>(
            sql`select count(*)::int n from bildirim.duyurular where ${sorgu}`,
          );
          return { ogeler: satirlar, toplam: t?.n ?? 0 };
        });
      },
    );

    app.patch(
      `${yol}/:duyuru_id`,
      {
        schema: {
          tags: ['bildirim'],
          summary:
            'Duyuruyu gunceller. Taslakta tum alanlar; yayindakinde yalniz `sabit` ve `bitis_at` (arsivde 409).',
          params: duyuruYolParamSema,
          body: DuyuruGuncelleSema,
          response: { 200: DuyuruSema },
        },
      },
      async (request) => {
        const k = kimlik(request, request.params.kurum_id);
        yazabilir(k);
        const b = request.body;
        const an = secenek.simdi();
        return withTenant(db, baglam(k), async (tx) => {
          const d = await duyuruKilitle(tx, k.kurumId, request.params.duyuru_id);
          if (!yonetebilirMi(k, d)) throw gorunmez();
          if (d.durum === 'arsiv') {
            throw new AppError(409, errorCodes.conflict, 'Arşivlenmiş duyuru değiştirilemez.');
          }
          if (d.durum === 'yayinda') {
            const yasak = Object.keys(b).filter((a) => a !== 'sabit' && a !== 'bitis_at');
            if (yasak.length > 0) {
              throw new AppError(
                409,
                errorCodes.conflict,
                'Yayındaki duyuruda yalnız sabitleme ve bitiş değiştirilebilir.',
              );
            }
          }
          if (b.bitis_at && new Date(b.bitis_at).getTime() <= an.getTime()) {
            throw new AppError(400, errorCodes.validation, 'Bitiş zamanı geçmişte olamaz.');
          }
          if (b.hedef_turu !== undefined || b.hedef_id !== undefined) {
            const turu = b.hedef_turu ?? d.hedef_turu;
            const hedefId = turu === 'kurum' ? k.kurumId : (b.hedef_id ?? d.hedef_id);
            if (turu !== 'kurum' && b.hedef_turu !== undefined && b.hedef_id === undefined) {
              throw new AppError(
                400,
                errorCodes.validation,
                'Hedef türü değişince hedef_id verilmeli.',
              );
            }
            await hedefiDogrula(tx, k.kurumId, turu, hedefId);
            await hedefYetkisi(tx, k, turu, hedefId, await kurumBugunu(tx, k.kurumId, an));
            b.hedef_turu = turu;
            b.hedef_id = hedefId;
          }
          const atamalar = [
            b.baslik !== undefined ? sql`baslik = ${b.baslik}` : null,
            b.govde !== undefined ? sql`govde = ${b.govde}` : null,
            b.hedef_turu !== undefined ? sql`hedef_turu = ${b.hedef_turu}` : null,
            b.hedef_id !== undefined ? sql`hedef_id = ${b.hedef_id}` : null,
            b.hedef_roller !== undefined
              ? sql`hedef_roller = ${metinDizisi(b.hedef_roller)}`
              : null,
            b.sabit !== undefined ? sql`sabit = ${b.sabit}` : null,
            b.bitis_at !== undefined ? sql`bitis_at = ${tarih(b.bitis_at)}::timestamptz` : null,
            b.push_gonderildi !== undefined ? sql`push_gonderildi = ${b.push_gonderildi}` : null,
          ].filter((x) => x !== null);
          const [s] = await tx.execute<DuyuruSatiri>(sql`
            update bildirim.duyurular set ${sql.join(atamalar, sql`, `)}
             where kurum_id = ${k.kurumId} and id = ${d.id}
            returning ${DUYURU_KOLONLARI}`);
          if (!s) throw gorunmez();
          if (d.durum === 'yayinda' && b.bitis_at !== undefined) {
            await kutuGecerliligiAyarla(
              tx,
              k.kurumId,
              d.id,
              b.bitis_at ? new Date(b.bitis_at) : null,
            );
          }
          return s;
        });
      },
    );

    app.post(
      `${yol}/:duyuru_id/yayinla`,
      {
        schema: {
          tags: ['bildirim'],
          summary:
            'Taslagi yayinlar: alicilar cozulur (`duyuru_alicilari`), kutu bildirimi ve (`push_gonderildi` ise) genel metinli push uretilir. `duyuru` modulu kapaliysa 403 `modul_kapali`.',
          params: duyuruYolParamSema,
          response: { 200: DuyuruSema },
        },
      },
      async (request) => {
        const k = kimlik(request, request.params.kurum_id);
        yazabilir(k);
        const s = await withTenant(db, baglam(k), (tx) =>
          duyuruYayinla(tx, k, request.params.duyuru_id, secenek.simdi()),
        );
        return s.duyuru;
      },
    );

    app.post(
      `${yol}/:duyuru_id/arsivle`,
      {
        schema: {
          tags: ['bildirim'],
          summary: 'Yayindaki duyuruyu arsivler: alicilarin listesinden ve kutusundan kalkar.',
          params: duyuruYolParamSema,
          response: { 200: DuyuruSema },
        },
      },
      async (request) => {
        const k = kimlik(request, request.params.kurum_id);
        yazabilir(k);
        const an = secenek.simdi();
        return withTenant(db, baglam(k), async (tx) => {
          const d = await duyuruKilitle(tx, k.kurumId, request.params.duyuru_id);
          if (!yonetebilirMi(k, d)) throw gorunmez();
          if (d.durum !== 'yayinda') {
            throw new AppError(409, errorCodes.conflict, 'Yalnız yayındaki duyuru arşivlenir.');
          }
          const [s] = await tx.execute<DuyuruSatiri>(sql`
            update bildirim.duyurular set durum = 'arsiv'
             where kurum_id = ${k.kurumId} and id = ${d.id} returning ${DUYURU_KOLONLARI}`);
          await kutuGecerliligiAyarla(tx, k.kurumId, d.id, an);
          if (!s) throw gorunmez();
          return s;
        });
      },
    );

    app.delete(
      `${yol}/:duyuru_id`,
      {
        schema: {
          tags: ['bildirim'],
          summary: 'Duyuruyu siler (yumusak silme; kutudaki bildirimleri de gizlenir).',
          params: duyuruYolParamSema,
          response: { 200: DuyuruSilYanitiSema },
        },
      },
      async (request) => {
        const k = kimlik(request, request.params.kurum_id);
        yazabilir(k);
        const an = secenek.simdi();
        return withTenant(db, baglam(k), async (tx) => {
          const d = await duyuruKilitle(tx, k.kurumId, request.params.duyuru_id);
          if (!yonetebilirMi(k, d)) throw gorunmez();
          await tx.execute(sql`
            update bildirim.duyurular set silindi_at = ${an.toISOString()}::timestamptz
             where kurum_id = ${k.kurumId} and id = ${d.id}`);
          await kutuGecerliligiAyarla(tx, k.kurumId, d.id, an);
          return { id: d.id, silindi: true as const };
        });
      },
    );

    app.get(
      `${yol}/:duyuru_id/okuyanlar`,
      {
        schema: {
          tags: ['bildirim'],
          summary:
            'Duyuruyu okuyanlar (yazar/yonetici): yalniz uyelik kimlikleri, adlar istemcide api`den cozulur.',
          params: duyuruYolParamSema,
          querystring: DuyuruOkuyanlarSorguSema,
          response: { 200: DuyuruOkuyanlarSema },
        },
      },
      async (request) => {
        const k = kimlik(request, request.params.kurum_id);
        yazabilir(k);
        const { limit, offset } = request.query;
        return withTenant(db, baglam(k), async (tx) => {
          const [d] = await tx.execute<DuyuruSatiri>(sql`
            select ${DUYURU_KOLONLARI} from bildirim.duyurular
             where kurum_id = ${k.kurumId} and id = ${request.params.duyuru_id} and silindi_at is null`);
          if (!d || !yonetebilirMi(k, d)) throw gorunmez();
          const okuyanlar = await tx.execute<{ alici_id: string; okundu_at: string }>(sql`
            select alici_id, ${iso('okundu_at')} as okundu_at from bildirim.duyuru_alicilari
             where kurum_id = ${k.kurumId} and duyuru_id = ${d.id} and okundu_at is not null
             order by okundu_at, alici_id limit ${limit ?? 100} offset ${offset ?? 0}`);
          return { okuyanlar, okunan_sayisi: d.okunan_sayisi, alici_sayisi: d.alici_sayisi };
        });
      },
    );

    // --- Alici ------------------------------------------------------------------------------

    app.get(
      yol,
      {
        schema: {
          tags: ['bildirim'],
          summary:
            'Duyurularim (alici): sabitler uste, yayin zamanina gore yeniden eskiye; suresi gecen, arsivlenen ve silinenler gizli.',
          params: duyuruKurumYolParamSema,
          querystring: DuyuruAliciSorguSema,
          response: { 200: DuyuruAliciListesiSema },
        },
      },
      async (request) => {
        const k = kimlik(request, request.params.kurum_id);
        okuyabilir(k);
        const { okunmamis, limit, offset } = request.query;
        const an = secenek.simdi().toISOString();
        const kosul = sql`
          a.kurum_id = ${k.kurumId} and a.alici_id = ${k.uyelikId}
          and d.durum = 'yayinda' and d.silindi_at is null
          and (d.bitis_at is null or d.bitis_at > ${an}::timestamptz)
          ${okunmamis === 'true' ? sql`and a.okundu_at is null` : sql``}`;
        return withTenant(db, baglam(k), async (tx) => {
          const ogeler = await tx.execute<DuyuruAliciSatiri>(sql`
            select d.id, d.baslik, d.govde, d.hedef_turu, d.hedef_id, d.yazar_id, d.sabit,
                   ${iso('d.yayin_at')} as yayin_at, ${iso('d.bitis_at')} as bitis_at,
                   ${iso('a.okundu_at')} as okundu_at
              from bildirim.duyuru_alicilari a
              join bildirim.duyurular d on d.kurum_id = a.kurum_id and d.id = a.duyuru_id
             where ${kosul}
             order by d.sabit desc, d.yayin_at desc, d.id desc
             limit ${limit ?? DUYURU_LISTE_VARSAYILAN} offset ${offset ?? 0}`);
          const [t] = await tx.execute<{ n: number }>(sql`
            select count(*)::int n from bildirim.duyuru_alicilari a
              join bildirim.duyurular d on d.kurum_id = a.kurum_id and d.id = a.duyuru_id
             where ${kosul}`);
          return { ogeler, toplam: t?.n ?? 0 };
        });
      },
    );

    app.get(
      `${yol}/:duyuru_id`,
      {
        schema: {
          tags: ['bildirim'],
          summary:
            'Tekil duyuru. Alici icin yalniz kendi (yayindaki, suresi gecmemis) duyurusu; yazar/yonetici icin her durumda, `yonetim` blogu ile.',
          params: duyuruYolParamSema,
          response: { 200: DuyuruDetaySema },
        },
      },
      async (request) => {
        const k = kimlik(request, request.params.kurum_id);
        okuyabilir(k);
        const an = secenek.simdi().toISOString();
        return withTenant(db, baglam(k), async (tx) => {
          const [d] = await tx.execute<DuyuruSatiri>(sql`
            select ${DUYURU_KOLONLARI} from bildirim.duyurular
             where kurum_id = ${k.kurumId} and id = ${request.params.duyuru_id} and silindi_at is null`);
          if (!d) throw gorunmez();
          const yonetim = izinVarMi(k.rol, 'duyuru.yaz', 'grup') && yonetebilirMi(k, d);
          const [a] = await tx.execute<{ okundu_at: string | null }>(sql`
            select ${iso('okundu_at')} as okundu_at from bildirim.duyuru_alicilari
             where kurum_id = ${k.kurumId} and duyuru_id = ${d.id} and alici_id = ${k.uyelikId}`);
          const gorunur =
            d.durum === 'yayinda' &&
            (d.bitis_at === null || new Date(d.bitis_at).toISOString() > an);
          if (!yonetim && !(a && gorunur)) throw gorunmez();
          return {
            id: d.id,
            baslik: d.baslik,
            govde: d.govde,
            hedef_turu: d.hedef_turu,
            hedef_id: d.hedef_id,
            yazar_id: d.yazar_id,
            sabit: d.sabit,
            yayin_at: d.yayin_at,
            bitis_at: d.bitis_at,
            okundu_at: a?.okundu_at ?? null,
            yonetim: yonetim ? d : null,
          };
        });
      },
    );

    app.post(
      `${yol}/:duyuru_id/okundu`,
      {
        schema: {
          tags: ['bildirim'],
          summary:
            'Duyuruyu okundu isaretler: okunan sayaci yalniz ilk okumada artar; kutudaki duyuru bildirimi de okundu olur.',
          params: duyuruYolParamSema,
          response: { 200: DuyuruOkunduYanitiSema },
        },
      },
      async (request) => {
        const k = kimlik(request, request.params.kurum_id);
        okuyabilir(k);
        const okundu = await withTenant(db, baglam(k), (tx) =>
          okunduIsaretle(tx, k, request.params.duyuru_id, secenek.simdi()),
        );
        return { duyuru_id: request.params.duyuru_id, okundu_at: okundu };
      },
    );

    return Promise.resolve();
  };
}
