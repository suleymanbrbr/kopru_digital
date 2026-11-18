import {
  OgrenmeRaporOzetSema,
  RAPOR_LISTE_MAKS,
  RaporListeSorguSema,
  RaporOdevListeSema,
  RaporOgrenciOraniListeSema,
  RaporSoruListeSema,
  RaporSorguSema,
  errorCodes,
  type ModulKodu,
  type RaporDonemi,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { oranHesapla, yoklamasiAlinanOgrenciler } from '../ders/index.js';
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
 * Yonetici paneli: ogrenme modulunun gostergeleri (odev, plan, soru) ve etkin ogrenci sayisi.
 *
 * GOSTERGE TANIMLARI (docs/schema/api.md "Yonetici paneli ve raporlar" ile ayni):
 *  - odev teslim orani = teslim tarihi (`ogrenci_odevleri.son_teslim_at`, yoksa odevin) donemde ve
 *    simdiye kadar gelmis, taslak olmayan odevlerin iptal edilmemis ogrenci satirlarinda teslim edilen
 *    (`teslim_edildi`, `incelendi`, `tekrar_istendi`) / toplam. Teslim tarihi gelmemis ya da hic
 *    belirlenmemis odev paydaya girmez. Ogretmen = odevi veren.
 *  - plan tamamlama orani = yayindaki haftalik planlarin gorevlerinden gunu (`gun`) donemde olan,
 *    devredilmemis (`devredildi` haric) gorevlerde `tamam` olan / toplam. Bugunun henuz `bekliyor`
 *    gorevleri paydaya girmez (gun bitmedi). `kismen` tamamlanmis sayilmaz. Ogretmen = plani hazirlayan.
 *  - soru: donemde sorulan sorular (`sorular.created_at`); cevaplanan = ilk cevabi olan; ilk cevap suresi =
 *    `ilk_cevap_at - created_at` saniye, ortalama ve medyan yalniz cevaplananlar uzerinden. Ogretmen =
 *    ilk cevaplayan (`soru-olcum` ucu ile ayni olcut).
 *  - etkin ogrenci = son 7 gunde (donemden bagimsiz) yoklamasi alinan (`geldi`/`gec`), odev teslim eden,
 *    plan gorevi tamamlayan veya soru soran ogrenci sayisi.
 *  - Kirilimlar: ogrenci tabanli gostergelerde grup = ogrencinin etkin grup uyeligi (birden cok grupta
 *    olan ogrenci her grupta sayilir); kurum satiri kapsamdaki etkin ogrencilerin tumudur (grupsuz dahil).
 *  - Modul kapali (`odev` / `haftalik_plan` / `soru_sor`, kurum duzeyi) ise ilgili gosterge `null`.
 */

const kurumParamSema = z.object({ kurum_id: z.uuid() });

const kiraci = (y: YetkiBaglami) => ({
  kurumId: y.kurumId,
  kullaniciId: y.kullaniciId,
  roller: [y.rol],
});

interface KirilimSatiri extends Record<string, unknown> {
  tur: 'kurum' | 'grup' | 'ogretmen';
  anahtar: string | null;
  a: number;
  b: number;
  c: number | null;
  e: number | null;
}

/**
 * Kurum / grup / ogretmen satirlarini tek sorguda uretir. `t(ogrenci_id, ogretmen_id, bir, sn)`
 * ortak ifadesi gostergeye gore verilir; `ozet` toplama ifadeleridir (`t.` onekli, 4 sutun: a, b, c, e).
 */
function kirilimlar(tx: Tx, y: YetkiBaglami, t: SQL, ozet: SQL): SQL {
  return sql`
    with t as (${t})
    select 'kurum'::text as tur, null::uuid as anahtar, ${ozet} from t
    union all
    select 'grup', gu.grup_id, ${ozet}
      from t join hesap.grup_uyeleri gu on gu.ogrenci_id = t.ogrenci_id and gu.bitis_tarihi is null
      where gu.grup_id in ${kapsamdakiGruplar(tx, y)}
      group by gu.grup_id
    union all
    select 'ogretmen', t.ogretmen_id, ${ozet}
      from t where t.ogretmen_id is not null
      group by t.ogretmen_id`;
}

const ODEV_OZET = sql`coalesce(sum(t.bir), 0)::int as a, count(*)::int as b, null::int as c, null::int as e`;
const SORU_OZET = sql`count(*)::int as a, (count(t.sn))::int as b,
  round(avg(t.sn))::int as c, round(percentile_cont(0.5) within group (order by t.sn))::int as e`;

/** Odev satirlarinin ortak kosulu: teslim tarihi donemde ve gelmis. */
const odevPenceresi = (d: RaporDonemBilgisi) => sql`
  o.durum <> 'taslak' and oo.durum <> 'iptal'
  and coalesce(oo.son_teslim_at, o.son_teslim_at) >= ${d.alt}::timestamptz
  and coalesce(oo.son_teslim_at, o.son_teslim_at) < least(${d.ust}::timestamptz, now())`;

/** Plan gorevlerinin ortak kosulu. */
const planPenceresi = (d: RaporDonemBilgisi) => sql`
  hp.durum = 'yayinda' and pg.durum <> 'devredildi'
  and pg.gun >= ${d.baslangic}::date and pg.gun <= ${d.bitis}::date
  and (pg.gun < ${d.bitis}::date or pg.durum <> 'bekliyor')`;

export async function ogrenmeRaporOzeti(
  tx: Tx,
  y: YetkiBaglami,
  donem: RaporDonemi,
): Promise<z.infer<typeof OgrenmeRaporOzetSema>> {
  const d = await raporDonemi(tx, y.kurumId, donem);
  const ogrenciler = kapsamdakiOgrenciler(tx, y);
  const [odevAcik, planAcik, soruAcik] = await Promise.all([
    modulAcikMi(tx, y.kurumId, 'odev'),
    modulAcikMi(tx, y.kurumId, 'haftalik_plan'),
    modulAcikMi(tx, y.kurumId, 'soru_sor'),
  ]);

  const odev = odevAcik
    ? await tx.execute<KirilimSatiri>(
        kirilimlar(
          tx,
          y,
          sql`select oo.ogrenci_id, o.veren_id as ogretmen_id,
                (oo.durum in ('teslim_edildi', 'incelendi', 'tekrar_istendi'))::int as bir, null::int as sn
              from ogrenme.ogrenci_odevleri oo join ogrenme.odevler o on o.id = oo.odev_id
              where oo.kurum_id = ${y.kurumId}::uuid and ${odevPenceresi(d)}
                and oo.ogrenci_id in ${ogrenciler}`,
          ODEV_OZET,
        ),
      )
    : null;
  const plan = planAcik
    ? await tx.execute<KirilimSatiri>(
        kirilimlar(
          tx,
          y,
          sql`select pg.ogrenci_id, hp.hazirlayan_id as ogretmen_id,
                (pg.durum = 'tamam')::int as bir, null::int as sn
              from ogrenme.plan_gorevleri pg join ogrenme.haftalik_planlar hp on hp.id = pg.plan_id
              where pg.kurum_id = ${y.kurumId}::uuid and ${planPenceresi(d)}
                and pg.ogrenci_id in ${ogrenciler}`,
          ODEV_OZET,
        ),
      )
    : null;
  const soru = soruAcik
    ? await tx.execute<KirilimSatiri>(
        kirilimlar(
          tx,
          y,
          sql`select s.ogrenci_id, s.ilk_cevaplayan_id as ogretmen_id, 0 as bir,
                case when s.ilk_cevap_at is null then null
                  else extract(epoch from (s.ilk_cevap_at - s.created_at)) end as sn
              from ogrenme.sorular s
              where s.kurum_id = ${y.kurumId}::uuid
                and s.created_at >= ${d.alt}::timestamptz and s.created_at < ${d.ust}::timestamptz
                and s.ogrenci_id in ${ogrenciler}`,
          SORU_OZET,
        ),
      )
    : null;

  // Etkin ogrenci: son 7 gun. Yoklama ders modulundan gelir (modul siniri), digerleri bu modulun tablolari.
  const yoklamali = await yoklamasiAlinanOgrenciler(tx, y, d);
  const etkinCte = sql`
    with e as (
      select distinct x.ogrenci_id from (
        select v::uuid as ogrenci_id from jsonb_array_elements_text(${JSON.stringify(yoklamali)}::jsonb) v
        union select oo.ogrenci_id from ogrenme.ogrenci_odevleri oo
          where oo.kurum_id = ${y.kurumId}::uuid and oo.teslim_at >= ${d.yediAlt}::timestamptz
        union select pg.ogrenci_id from ogrenme.plan_gorevleri pg
          where pg.kurum_id = ${y.kurumId}::uuid and pg.tamamlandi_at >= ${d.yediAlt}::timestamptz
        union select s.ogrenci_id from ogrenme.sorular s
          where s.kurum_id = ${y.kurumId}::uuid and s.created_at >= ${d.yediAlt}::timestamptz
      ) x where x.ogrenci_id in ${ogrenciler}
    )`;
  const etkin = await tx.execute<{ tur: string; anahtar: string | null; n: number }>(sql`
    ${etkinCte}
    select 'kurum'::text as tur, null::uuid as anahtar, count(*)::int as n from e
    union all
    select 'grup', gu.grup_id, count(distinct e.ogrenci_id)::int
      from e join hesap.grup_uyeleri gu on gu.ogrenci_id = e.ogrenci_id and gu.bitis_tarihi is null
      where gu.grup_id in ${kapsamdakiGruplar(tx, y)}
      group by gu.grup_id`);

  const bul = (satirlar: KirilimSatiri[] | null, tur: KirilimSatiri['tur'], k: string | null) =>
    satirlar?.find((s) => s.tur === tur && s.anahtar === k) ?? { a: 0, b: 0, c: null, e: null };
  const oranli = (
    satirlar: KirilimSatiri[] | null,
    tur: KirilimSatiri['tur'],
    k: string | null,
  ) => {
    if (satirlar === null) return null;
    const s = bul(satirlar, tur, k);
    return { pay: s.a, payda: s.b, oran: oranHesapla(s.a, s.b) };
  };
  const soruGostergesi = (tur: KirilimSatiri['tur'], k: string | null) => {
    if (soru === null) return null;
    const s = bul(soru, tur, k);
    return {
      soru_sayisi: s.a,
      cevaplanan: s.b,
      ortalama_ilk_cevap_sn: s.c,
      medyan_ilk_cevap_sn: s.e,
    };
  };
  const gosterge = (tur: KirilimSatiri['tur'], k: string | null) => ({
    odev: oranli(odev, tur, k),
    plan: oranli(plan, tur, k),
    soru: soruGostergesi(tur, k),
  });
  const anahtarlar = (
    tur: KirilimSatiri['tur'],
    ek: readonly { tur: string; anahtar: string | null }[],
  ) => [
    ...new Set(
      [...(odev ?? []), ...(plan ?? []), ...(soru ?? []), ...ek].flatMap((s) =>
        s.tur === tur && s.anahtar !== null ? [s.anahtar] : [],
      ),
    ),
  ];
  const etkinSayisi = (k: string | null) =>
    etkin.find((s) => s.tur === (k === null ? 'kurum' : 'grup') && s.anahtar === k)?.n ?? 0;

  return {
    ...donemAlani(d, y),
    kurum: { ...gosterge('kurum', null), etkin_ogrenci: etkinSayisi(null) },
    gruplar: anahtarlar('grup', etkin).map((id) => ({
      grup_id: id,
      ...gosterge('grup', id),
      etkin_ogrenci: etkinSayisi(id),
    })),
    ogretmenler: anahtarlar('ogretmen', []).map((id) => ({
      ogretmen_id: id,
      ...gosterge('ogretmen', id),
    })),
  };
}

// --- Alt listeler ------------------------------------------------------------------------------

interface Suzgec {
  grupId?: string | undefined;
  ogretmenId?: string | undefined;
}

async function modulKapisi(tx: Tx, y: YetkiBaglami, modul: ModulKodu): Promise<void> {
  if (!(await modulAcikMi(tx, y.kurumId, modul))) {
    throw new AppError(403, errorCodes.modulKapali, 'Bu özellik kurumunuzda kapalı.');
  }
}

/** Ogrenci satirina grup suzgeci (grup kapsamda olmali; ogrenci grubun etkin uyesi). */
const grupSuzgeci = (tx: Tx, y: YetkiBaglami, kolon: SQL, grupId?: string): SQL =>
  grupId
    ? sql`and ${kolon} in (select ogrenci_id from hesap.grup_uyeleri
          where grup_id = ${grupId}::uuid and bitis_tarihi is null)
        and ${grupId}::uuid in ${kapsamdakiGruplar(tx, y)}`
    : sql``;

async function odevListesi(tx: Tx, y: YetkiBaglami, donem: RaporDonemi, f: Suzgec) {
  await modulKapisi(tx, y, 'odev');
  const d = await raporDonemi(tx, y.kurumId, donem);
  const satirlar = await tx.execute<{
    ogrenci_odev_id: string;
    odev_id: string;
    baslik: string;
    ogrenci_id: string;
    son_teslim_at: string;
    durum: string;
    toplam: number;
  }>(sql`
    select oo.id as ogrenci_odev_id, o.id as odev_id, o.baslik, oo.ogrenci_id,
      to_char(coalesce(oo.son_teslim_at, o.son_teslim_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as son_teslim_at,
      oo.durum, (count(*) over())::int as toplam
    from ogrenme.ogrenci_odevleri oo join ogrenme.odevler o on o.id = oo.odev_id
    where oo.kurum_id = ${y.kurumId}::uuid and ${odevPenceresi(d)} and oo.durum = 'atandi'
      and oo.ogrenci_id in ${kapsamdakiOgrenciler(tx, y)}
      ${grupSuzgeci(tx, y, sql`oo.ogrenci_id`, f.grupId)}
      ${f.ogretmenId ? sql`and o.veren_id = ${f.ogretmenId}::uuid` : sql``}
    order by coalesce(oo.son_teslim_at, o.son_teslim_at), oo.id
    limit ${RAPOR_LISTE_MAKS}`);
  const adlar = await gorunenAdlar(
    tx,
    satirlar.map((s) => s.ogrenci_id),
  );
  return {
    toplam_satir: satirlar[0]?.toplam ?? 0,
    satirlar: satirlar.map(({ toplam: _t, ...s }) => ({
      ...s,
      gorunen_ad: adlar.get(s.ogrenci_id) ?? null,
    })),
  };
}

async function planListesi(tx: Tx, y: YetkiBaglami, donem: RaporDonemi, f: Suzgec) {
  await modulKapisi(tx, y, 'haftalik_plan');
  const d = await raporDonemi(tx, y.kurumId, donem);
  const satirlar = await tx.execute<{
    ogrenci_id: string;
    pay: number;
    payda: number;
    kismen: number;
    yapilmadi: number;
    bekliyor: number;
    toplam: number;
  }>(sql`
    select pg.ogrenci_id,
      (count(*) filter (where pg.durum = 'tamam'))::int as pay, count(*)::int as payda,
      (count(*) filter (where pg.durum = 'kismen'))::int as kismen,
      (count(*) filter (where pg.durum = 'yapilmadi'))::int as yapilmadi,
      (count(*) filter (where pg.durum = 'bekliyor'))::int as bekliyor,
      (count(*) over())::int as toplam
    from ogrenme.plan_gorevleri pg join ogrenme.haftalik_planlar hp on hp.id = pg.plan_id
    where pg.kurum_id = ${y.kurumId}::uuid and ${planPenceresi(d)}
      and pg.ogrenci_id in ${kapsamdakiOgrenciler(tx, y)}
      ${grupSuzgeci(tx, y, sql`pg.ogrenci_id`, f.grupId)}
      ${f.ogretmenId ? sql`and hp.hazirlayan_id = ${f.ogretmenId}::uuid` : sql``}
    group by pg.ogrenci_id
    order by (count(*) filter (where pg.durum = 'tamam'))::numeric / count(*), count(*) desc, pg.ogrenci_id
    limit ${RAPOR_LISTE_MAKS}`);
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
      ayrinti: {
        tamam: s.pay,
        kismen: s.kismen,
        yapilmadi: s.yapilmadi,
        bekliyor: s.bekliyor,
      },
    })),
  };
}

async function soruListesi(tx: Tx, y: YetkiBaglami, donem: RaporDonemi, f: Suzgec) {
  await modulKapisi(tx, y, 'soru_sor');
  const d = await raporDonemi(tx, y.kurumId, donem);
  const satirlar = await tx.execute<{
    soru_id: string;
    ogrenci_id: string;
    brans_kodu: string;
    durum: string;
    sorulma_at: string;
    ilk_cevap_sn: number | null;
    toplam: number;
  }>(sql`
    select s.id as soru_id, s.ogrenci_id, s.brans_kodu, s.durum,
      to_char(s.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as sorulma_at,
      case when s.ilk_cevap_at is null then null
        else round(extract(epoch from (s.ilk_cevap_at - s.created_at)))::int end as ilk_cevap_sn,
      (count(*) over())::int as toplam
    from ogrenme.sorular s
    where s.kurum_id = ${y.kurumId}::uuid
      and s.created_at >= ${d.alt}::timestamptz and s.created_at < ${d.ust}::timestamptz
      and s.ogrenci_id in ${kapsamdakiOgrenciler(tx, y)}
      ${grupSuzgeci(tx, y, sql`s.ogrenci_id`, f.grupId)}
      ${f.ogretmenId ? sql`and s.ilk_cevaplayan_id = ${f.ogretmenId}::uuid` : sql``}
    order by (s.ilk_cevap_at - s.created_at) desc nulls first, s.id
    limit ${RAPOR_LISTE_MAKS}`);
  const adlar = await gorunenAdlar(
    tx,
    satirlar.map((s) => s.ogrenci_id),
  );
  return {
    toplam_satir: satirlar[0]?.toplam ?? 0,
    satirlar: satirlar.map(({ toplam: _t, ...s }) => ({
      ...s,
      gorunen_ad: adlar.get(s.ogrenci_id) ?? null,
    })),
  };
}

/** `/v1/ogrenme/kurumlar/:kurum_id/rapor/*` (Excel dosyasi `rapor-excel.ts`'te). */
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
        tags: ['ogrenme'],
        summary:
          'Yonetici paneli: odev teslim orani, plan tamamlama orani, soru ilk cevap suresi (ortalama/medyan) ve etkin ogrenci; kurum, grup ve ogretmen kirilimi. Ogretmen yalniz atandigi gruplari gorur. Modul kapaliysa gosterge `null`.',
        params: kurumParamSema,
        querystring: RaporSorguSema,
        response: { 200: OgrenmeRaporOzetSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), (tx) => ogrenmeRaporOzeti(tx, y, request.query.donem));
    },
  );

  const listeUcu = (
    ad: string,
    ozet: string,
    sema: z.ZodType,
    calistir: (tx: Tx, y: YetkiBaglami, donem: RaporDonemi, f: Suzgec) => Promise<unknown>,
  ) => {
    app.get(
      `/kurumlar/:kurum_id/rapor/${ad}`,
      {
        ...oku,
        schema: {
          tags: ['ogrenme'],
          summary: ozet,
          params: kurumParamSema,
          querystring: RaporListeSorguSema,
          response: { 200: sema },
        },
      },
      async (request) => {
        const y = yetkiAl(request);
        const { donem, grup_id: grupId, ogretmen_id: ogretmenId } = request.query;
        return withTenant(db, kiraci(y), (tx) => calistir(tx, y, donem, { grupId, ogretmenId }));
      },
    );
  };
  listeUcu(
    'odev',
    'Teslim edilmeyen odev satirlari (teslim tarihi donemde gelmis, hala `atandi`); en eski teslim tarihi once; en cok 200 satir.',
    RaporOdevListeSema,
    odevListesi,
  );
  listeUcu(
    'plan',
    'Plan tamamlama alt listesi: ogrenci bazinda tamam/kismen/yapilmadi/bekliyor, en dusuk oran once; en cok 200 satir.',
    RaporOgrenciOraniListeSema,
    planListesi,
  );
  listeUcu(
    'soru',
    'Donemde sorulan sorular: cevap bekleyenler ve en uzun ilk cevap suresi once; en cok 200 satir.',
    RaporSoruListeSema,
    soruListesi,
  );

  return Promise.resolve();
};
