import {
  BILDIRIM_KUTU_SAYFA_VARSAYILAN,
  BildirimKutuIslemYanitiSema,
  BildirimKutuListesiSema,
  BildirimKutuSorguSema,
  BildirimOkunmamisSayisiSema,
  BildirimTumunuOkuYanitiSema,
  bildirimKurumYolParamSema,
  bildirimKutuOgeYolParamSema,
  errorCodes,
  type BildirimKategori,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

import { kimlik } from './kimlik.js';
import { iso, isoMikro } from './ortak.js';

interface Imlec {
  t: string;
  i: string;
}

const imlecKodla = (i: Imlec) => Buffer.from(JSON.stringify(i)).toString('base64url');

function imlecCoz(ham: string): Imlec {
  try {
    const j = JSON.parse(Buffer.from(ham, 'base64url').toString('utf8')) as Partial<Imlec>;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const zaman = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
    if (typeof j.t === 'string' && typeof j.i === 'string' && zaman.test(j.t) && uuid.test(j.i)) {
      return { t: j.t, i: j.i };
    }
  } catch {
    // asagidaki hataya duser
  }
  throw new AppError(400, errorCodes.validation, 'Sayfa imleci geçersiz.');
}

interface KutuSatiri extends Record<string, unknown> {
  id: string;
  kategori: string;
  sablon_kodu: string;
  baslik: string;
  govde: string;
  derin_baglanti: string | null;
  veri: Record<string, unknown>;
  okundu_at: string | null;
  gecerlilik_bitis_at: string | null;
  created_at: string;
  imlec_t: string;
}

/**
 * Gelen kutusu uclari. Alici = istegi yapanin o kurumdaki uyeligi (`uyelik_id` claim'i). Arsivlenmis ve
 * `gecerlilik_bitis_at` gecmis bildirimler gizlenir. Baska kullanicinin bildirimi icin `404` doner.
 */
export function kutuYollari(secenek: { simdi: () => Date }): ServicePlugin {
  return (app) => {
    const { db } = app;
    if (!db) return Promise.resolve();

    const baglam = (k: ReturnType<typeof kimlik>) => ({
      kurumId: k.kurumId,
      kullaniciId: k.kullaniciId,
      roller: [k.rol],
    });
    const bulunamadi = () => new AppError(404, errorCodes.notFound, 'Bildirim bulunamadı.');

    app.get(
      '/v1/bildirim/kurumlar/:kurum_id/kutu',
      {
        schema: {
          tags: ['bildirim'],
          summary:
            'Gelen kutusu (yeniden eskiye, imleçli sayfalama). `okunmamis=true` yalniz okunmamislari getirir; arsivlenmis ve suresi gecmis bildirimler gizlidir.',
          params: bildirimKurumYolParamSema,
          querystring: BildirimKutuSorguSema,
          response: { 200: BildirimKutuListesiSema },
        },
      },
      async (request) => {
        const k = kimlik(request, request.params.kurum_id);
        const { okunmamis, imlec, limit } = request.query;
        const n = limit ?? BILDIRIM_KUTU_SAYFA_VARSAYILAN;
        const c = imlec ? imlecCoz(imlec) : null;
        const an = secenek.simdi().toISOString();
        const satirlar = await withTenant(db, baglam(k), (tx) =>
          tx.execute<KutuSatiri>(sql`
            select id, kategori, sablon_kodu, baslik, govde, derin_baglanti, veri,
                   ${iso('okundu_at')} as okundu_at, ${iso('gecerlilik_bitis_at')} as gecerlilik_bitis_at,
                   ${iso('created_at')} as created_at, ${isoMikro('created_at')} as imlec_t
              from bildirim.bildirimler
             where kurum_id = ${k.kurumId} and alici_id = ${k.uyelikId} and arsivlendi_at is null
               and (gecerlilik_bitis_at is null or gecerlilik_bitis_at > ${an}::timestamptz)
               ${okunmamis === 'true' ? sql`and okundu_at is null` : sql``}
               ${c ? sql`and (created_at, id) < (${c.t}::timestamptz, ${c.i}::uuid)` : sql``}
             order by created_at desc, id desc
             limit ${n + 1}`),
        );
        const sayfa = satirlar.slice(0, n);
        const son = sayfa.at(-1);
        return {
          ogeler: sayfa.map(({ imlec_t: _t, ...oge }) => ({
            ...oge,
            kategori: oge.kategori as BildirimKategori,
          })),
          sonraki_imlec:
            satirlar.length > n && son ? imlecKodla({ t: son.imlec_t, i: son.id }) : null,
        };
      },
    );

    app.get(
      '/v1/bildirim/kurumlar/:kurum_id/kutu/okunmamis-sayisi',
      {
        schema: {
          tags: ['bildirim'],
          summary: 'Okunmamis (arsivlenmemis, suresi gecmemis) bildirim sayisi.',
          params: bildirimKurumYolParamSema,
          response: { 200: BildirimOkunmamisSayisiSema },
        },
      },
      async (request) => {
        const k = kimlik(request, request.params.kurum_id);
        const an = secenek.simdi().toISOString();
        const [s] = await withTenant(db, baglam(k), (tx) =>
          tx.execute<{ n: number }>(sql`
            select count(*)::int as n from bildirim.bildirimler
             where kurum_id = ${k.kurumId} and alici_id = ${k.uyelikId}
               and okundu_at is null and arsivlendi_at is null
               and (gecerlilik_bitis_at is null or gecerlilik_bitis_at > ${an}::timestamptz)`),
        );
        return { okunmamis: s?.n ?? 0 };
      },
    );

    app.post(
      '/v1/bildirim/kurumlar/:kurum_id/kutu/tumunu-oku',
      {
        schema: {
          tags: ['bildirim'],
          summary: 'Tum okunmamis bildirimleri okundu isaretler.',
          params: bildirimKurumYolParamSema,
          response: { 200: BildirimTumunuOkuYanitiSema },
        },
      },
      async (request) => {
        const k = kimlik(request, request.params.kurum_id);
        const an = secenek.simdi().toISOString();
        const satirlar = await withTenant(db, baglam(k), (tx) =>
          tx.execute(sql`
            update bildirim.bildirimler set okundu_at = ${an}::timestamptz
             where kurum_id = ${k.kurumId} and alici_id = ${k.uyelikId} and okundu_at is null
            returning 1`),
        );
        return { guncellenen: satirlar.length };
      },
    );

    const islem =
      (alan: 'okundu_at' | 'arsivlendi_at') =>
      async (request: {
        auth: Parameters<typeof kimlik>[0]['auth'];
        params: { kurum_id: string; bildirim_id: string };
      }) => {
        const k = kimlik(request, request.params.kurum_id);
        const an = secenek.simdi().toISOString();
        const [s] = await withTenant(db, baglam(k), (tx) =>
          tx.execute<{ id: string; okundu_at: string | null; arsivlendi_at: string | null }>(
            alan === 'okundu_at'
              ? sql`
                update bildirim.bildirimler set okundu_at = coalesce(okundu_at, ${an}::timestamptz)
                 where kurum_id = ${k.kurumId} and alici_id = ${k.uyelikId} and id = ${request.params.bildirim_id}
                returning id, ${iso('okundu_at')} as okundu_at, ${iso('arsivlendi_at')} as arsivlendi_at`
              : sql`
                update bildirim.bildirimler set arsivlendi_at = coalesce(arsivlendi_at, ${an}::timestamptz)
                 where kurum_id = ${k.kurumId} and alici_id = ${k.uyelikId} and id = ${request.params.bildirim_id}
                returning id, ${iso('okundu_at')} as okundu_at, ${iso('arsivlendi_at')} as arsivlendi_at`,
          ),
        );
        if (!s) throw bulunamadi();
        return { id: s.id, okundu_at: s.okundu_at, arsivlendi_at: s.arsivlendi_at };
      };

    app.post(
      '/v1/bildirim/kurumlar/:kurum_id/kutu/:bildirim_id/okundu',
      {
        schema: {
          tags: ['bildirim'],
          summary: 'Tek bildirimi okundu isaretler (tekrar cagri ilk okuma zamanini korur).',
          params: bildirimKutuOgeYolParamSema,
          response: { 200: BildirimKutuIslemYanitiSema },
        },
      },
      islem('okundu_at'),
    );

    app.post(
      '/v1/bildirim/kurumlar/:kurum_id/kutu/:bildirim_id/arsivle',
      {
        schema: {
          tags: ['bildirim'],
          summary: 'Bildirimi arsivler (kutuda gizlenir).',
          params: bildirimKutuOgeYolParamSema,
          response: { 200: BildirimKutuIslemYanitiSema },
        },
      },
      islem('arsivlendi_at'),
    );

    return Promise.resolve();
  };
}
