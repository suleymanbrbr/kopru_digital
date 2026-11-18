import {
  DersRaporOzetSema,
  RAPOR_LISTE_MAKS,
  RaporListeSorguSema,
  RaporOgrenciOraniListeSema,
  RaporSorguSema,
  errorCodes,
  type RaporDonemi,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import {
  donemAlani,
  gorunenAdlar,
  kapsamdakiGruplar,
  kapsamdakiOgrenciler,
  modulAcikMi,
  raporDonemi,
  requirePermission,
  type RaporDonemBilgisi,
  type YetkiBaglami,
} from '../hesap/index.js';

/**
 * Yonetici paneli: ders modulunun gostergeleri (devam orani, ders sonu "anladim" orani).
 *
 * GOSTERGE TANIMLARI (docs/schema/api.md "Yonetici paneli ve raporlar" ile ayni):
 *  - devam orani = donemde baslayan (`baslangic_at`), iptal edilmemis derslerin yoklamasi alinmis
 *    ogrenci katilimlarinda (`ders.yoklamalar`) (`geldi` + `gec`) / tum yoklama satirlari (`geldi`, `gec`,
 *    `gelmedi`, `izinli`). Yoklamasi alinmamis katilim paydaya girmez. Yalniz kapsamdaki etkin ogrenciler.
 *  - "anladim" orani = donemde biten (`bitis_at`) derslere verilmis ders sonu geri bildirimlerinde
 *    `anladim` / tum geri bildirimler (`anladim`, `kismen`, `anlamadim`). Hesap, `/geri-bildirim/ozet`
 *    ile ayni olcutu (ders bitis gunu) kullanir; orada ogretmen/brans, burada grup kirilimi da vardir.
 *  - Kirilimlar: grup = dersin grubu; ogretmen = dersin ogretmeni. Kurum satiri kapsamdaki tum dersler.
 *  - Modul kapali (`yoklama` / `geri_bildirim`, kurum duzeyi) ise ilgili gosterge `null`.
 */

const kurumParamSema = z.object({ kurum_id: z.uuid() });

/** 4 basamakli oran; payda 0 ise `null`. */
export const oranHesapla = (pay: number, payda: number): number | null =>
  payda === 0 ? null : Math.round((pay / payda) * 10_000) / 10_000;

const oranli = (pay: number, payda: number) => ({ pay, payda, oran: oranHesapla(pay, payda) });

const kiraci = (y: YetkiBaglami) => ({
  kurumId: y.kurumId,
  kullaniciId: y.kullaniciId,
  roller: [y.rol],
});

interface OranSatiri extends Record<string, unknown> {
  tur: 'kurum' | 'grup' | 'ogretmen';
  anahtar: string | null;
  pay: number;
  payda: number;
}

/** Dersin grubu rolun kapsaminda mi (kurum kapsaminda ek kosul yok). */
function grupKapsamKosulu(tx: Tx, y: YetkiBaglami, kolon: SQL): SQL {
  return y.kapsam === 'kurum' ? sql`true` : sql`${kolon} in ${kapsamdakiGruplar(tx, y)}`;
}

/** Kurum / grup / ogretmen satirlarini tek sorguda verir. `t(grup_id, ogretmen_id, bir)` ortak ifadesinden. */
const kirilimlar = (t: SQL) => sql`
  with t as (${t})
  select 'kurum'::text as tur, null::uuid as anahtar, coalesce(sum(bir), 0)::int as pay, count(*)::int as payda from t
  union all
  select 'grup', grup_id, sum(bir)::int, count(*)::int from t group by grup_id
  union all
  select 'ogretmen', ogretmen_id, sum(bir)::int, count(*)::int from t group by ogretmen_id`;

export async function dersRaporOzeti(
  tx: Tx,
  y: YetkiBaglami,
  donem: RaporDonemi,
): Promise<z.infer<typeof DersRaporOzetSema>> {
  const d = await raporDonemi(tx, y.kurumId, donem);
  const ogrenciler = kapsamdakiOgrenciler(tx, y);
  const [yoklamaAcik, geriBildirimAcik] = await Promise.all([
    modulAcikMi(tx, y.kurumId, 'yoklama'),
    modulAcikMi(tx, y.kurumId, 'geri_bildirim'),
  ]);

  const devam = yoklamaAcik
    ? await tx.execute<OranSatiri>(
        kirilimlar(sql`
          select d.grup_id, d.ogretmen_id, (yk.durum in ('geldi', 'gec'))::int as bir
          from ders.yoklamalar yk
          join ders.dersler d on d.id = yk.ders_id
          where yk.kurum_id = ${y.kurumId}::uuid and d.durum <> 'iptal'
            and d.baslangic_at >= ${d.alt}::timestamptz and d.baslangic_at < ${d.ust}::timestamptz
            and yk.ogrenci_id in ${ogrenciler}
            and ${grupKapsamKosulu(tx, y, sql`d.grup_id`)}`),
      )
    : null;
  const anladim = geriBildirimAcik
    ? await tx.execute<OranSatiri>(
        kirilimlar(sql`
          select d.grup_id, d.ogretmen_id, (gb.deger = 'anladim')::int as bir
          from ders.geri_bildirimler gb
          join ders.dersler d on d.id = gb.ders_id
          where gb.kurum_id = ${y.kurumId}::uuid
            and d.bitis_at >= ${d.alt}::timestamptz and d.bitis_at < ${d.ust}::timestamptz
            and gb.ogrenci_id in ${ogrenciler}
            and ${grupKapsamKosulu(tx, y, sql`d.grup_id`)}`),
      )
    : null;

  const bul = (satirlar: OranSatiri[] | null, tur: OranSatiri['tur'], anahtar: string | null) => {
    if (satirlar === null) return null;
    const s = satirlar.find((x) => x.tur === tur && x.anahtar === anahtar);
    return oranli(s?.pay ?? 0, s?.payda ?? 0);
  };
  const anahtarlar = (tur: OranSatiri['tur']) => [
    ...new Set(
      [...(devam ?? []), ...(anladim ?? [])].flatMap((s) =>
        s.tur === tur && s.anahtar !== null ? [s.anahtar] : [],
      ),
    ),
  ];
  const gosterge = (tur: OranSatiri['tur'], anahtar: string | null) => ({
    devam: bul(devam, tur, anahtar),
    anladim: bul(anladim, tur, anahtar),
  });
  return {
    ...donemAlani(d, y),
    kurum: gosterge('kurum', null),
    gruplar: anahtarlar('grup').map((id) => ({ grup_id: id, ...gosterge('grup', id) })),
    ogretmenler: anahtarlar('ogretmen').map((id) => ({
      ogretmen_id: id,
      ...gosterge('ogretmen', id),
    })),
  };
}

/** Son 7 gunde (donemden bagimsiz) yoklamasi alinan (`geldi`/`gec`) kapsamdaki ogrenciler. */
export async function yoklamasiAlinanOgrenciler(
  tx: Tx,
  y: YetkiBaglami,
  d: Pick<RaporDonemBilgisi, 'yediAlt'>,
): Promise<string[]> {
  const satirlar = await tx.execute<{ ogrenci_id: string }>(sql`
    select distinct yk.ogrenci_id
    from ders.yoklamalar yk
    join ders.dersler dd on dd.id = yk.ders_id
    where yk.kurum_id = ${y.kurumId}::uuid and yk.durum in ('geldi', 'gec') and dd.durum <> 'iptal'
      and dd.baslangic_at >= ${d.yediAlt}::timestamptz and dd.baslangic_at <= now()
      and yk.ogrenci_id in ${kapsamdakiOgrenciler(tx, y)}
      and ${grupKapsamKosulu(tx, y, sql`dd.grup_id`)}`);
  return satirlar.map((s) => s.ogrenci_id);
}

type Gosterge = 'devam' | 'anladim';

const ayrinti = (
  gosterge: Gosterge,
  s: { a: number; b: number; c: number; e: number },
): Record<string, number> =>
  gosterge === 'devam'
    ? { geldi: s.a, gec: s.b, gelmedi: s.c, izinli: s.e }
    : { anladim: s.a, kismen: s.b, anlamadim: s.c };

/** Ogrenci bazinda oran listesi (sayiya tiklaninca): en dusuk oran once. */
async function ogrenciListesi(
  tx: Tx,
  y: YetkiBaglami,
  gosterge: Gosterge,
  donem: RaporDonemi,
  suzgec: { grupId?: string | undefined; ogretmenId?: string | undefined },
): Promise<z.infer<typeof RaporOgrenciOraniListeSema>> {
  const d = await raporDonemi(tx, y.kurumId, donem);
  const ogrenciler = kapsamdakiOgrenciler(tx, y);
  if (!(await modulAcikMi(tx, y.kurumId, gosterge === 'devam' ? 'yoklama' : 'geri_bildirim'))) {
    throw new AppError(403, errorCodes.modulKapali, 'Bu özellik kurumunuzda kapalı.');
  }
  const ek = sql`${suzgec.grupId ? sql`and d.grup_id = ${suzgec.grupId}::uuid` : sql``}
    ${suzgec.ogretmenId ? sql`and d.ogretmen_id = ${suzgec.ogretmenId}::uuid` : sql``}`;
  const satirlar = await tx.execute<{
    ogrenci_id: string;
    pay: number;
    payda: number;
    a: number;
    b: number;
    c: number;
    e: number;
    toplam: number;
  }>(
    gosterge === 'devam'
      ? sql`
        select yk.ogrenci_id,
          (count(*) filter (where yk.durum in ('geldi', 'gec')))::int as pay, count(*)::int as payda,
          (count(*) filter (where yk.durum = 'geldi'))::int as a,
          (count(*) filter (where yk.durum = 'gec'))::int as b,
          (count(*) filter (where yk.durum = 'gelmedi'))::int as c,
          (count(*) filter (where yk.durum = 'izinli'))::int as e,
          (count(*) over())::int as toplam
        from ders.yoklamalar yk join ders.dersler d on d.id = yk.ders_id
        where yk.kurum_id = ${y.kurumId}::uuid and d.durum <> 'iptal'
          and d.baslangic_at >= ${d.alt}::timestamptz and d.baslangic_at < ${d.ust}::timestamptz
          and yk.ogrenci_id in ${ogrenciler}
          and ${grupKapsamKosulu(tx, y, sql`d.grup_id`)} ${ek}
        group by yk.ogrenci_id
        order by (count(*) filter (where yk.durum in ('geldi', 'gec')))::numeric / count(*), count(*) desc, yk.ogrenci_id
        limit ${RAPOR_LISTE_MAKS}`
      : sql`
        select gb.ogrenci_id,
          (count(*) filter (where gb.deger = 'anladim'))::int as pay, count(*)::int as payda,
          (count(*) filter (where gb.deger = 'anladim'))::int as a,
          (count(*) filter (where gb.deger = 'kismen'))::int as b,
          (count(*) filter (where gb.deger = 'anlamadim'))::int as c,
          0 as e,
          (count(*) over())::int as toplam
        from ders.geri_bildirimler gb join ders.dersler d on d.id = gb.ders_id
        where gb.kurum_id = ${y.kurumId}::uuid
          and d.bitis_at >= ${d.alt}::timestamptz and d.bitis_at < ${d.ust}::timestamptz
          and gb.ogrenci_id in ${ogrenciler}
          and ${grupKapsamKosulu(tx, y, sql`d.grup_id`)} ${ek}
        group by gb.ogrenci_id
        order by (count(*) filter (where gb.deger = 'anladim'))::numeric / count(*), count(*) desc, gb.ogrenci_id
        limit ${RAPOR_LISTE_MAKS}`,
  );
  const adlar = await gorunenAdlar(
    tx,
    satirlar.map((s) => s.ogrenci_id),
  );
  return {
    toplam_satir: satirlar[0]?.toplam ?? 0,
    satirlar: satirlar.map((s) => ({
      ogrenci_id: s.ogrenci_id,
      gorunen_ad: adlar.get(s.ogrenci_id) ?? null,
      pay: s.pay,
      payda: s.payda,
      oran: oranHesapla(s.pay, s.payda),
      ayrinti: ayrinti(gosterge, s),
    })),
  };
}

/** `/v1/ders/kurumlar/:kurum_id/rapor/*`. */
export const raporYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const oku = { preHandler: requirePermission('rapor.oku', { scope: 'grup' }) };
  const yetkiAl = (request: { yetki: YetkiBaglami | null }): YetkiBaglami => {
    if (!request.yetki) throw new AppError(403, errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
    return request.yetki;
  };

  app.get(
    '/kurumlar/:kurum_id/rapor/ozet',
    {
      ...oku,
      schema: {
        tags: ['ders'],
        summary:
          'Yonetici paneli: devam orani ve ders sonu "anladim" orani; kurum, grup ve ogretmen kirilimi. Ogretmen yalniz atandigi gruplari gorur. Modul kapaliysa gosterge `null`.',
        params: kurumParamSema,
        querystring: RaporSorguSema,
        response: { 200: DersRaporOzetSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), (tx) => dersRaporOzeti(tx, y, request.query.donem));
    },
  );

  for (const gosterge of ['devam', 'anladim'] as const) {
    app.get(
      `/kurumlar/:kurum_id/rapor/${gosterge}`,
      {
        ...oku,
        schema: {
          tags: ['ders'],
          summary:
            gosterge === 'devam'
              ? 'Devam orani alt listesi: ogrenci bazinda geldi/gec/gelmedi/izinli, en dusuk devam once; en cok 200 satir.'
              : 'Ders sonu geri bildirim alt listesi: ogrenci bazinda anladim/kismen/anlamadim, en dusuk "anladim" orani once; en cok 200 satir.',
          params: kurumParamSema,
          querystring: RaporListeSorguSema,
          response: { 200: RaporOgrenciOraniListeSema },
        },
      },
      async (request) => {
        const y = yetkiAl(request);
        const { donem, grup_id: grupId, ogretmen_id: ogretmenId } = request.query;
        return withTenant(db, kiraci(y), (tx) =>
          ogrenciListesi(tx, y, gosterge, donem, { grupId, ogretmenId }),
        );
      },
    );
  }

  return Promise.resolve();
};
