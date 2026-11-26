import {
  KOCLUK_ORTALAMA_HAFTA,
  KoclukSorguSema,
  KoclukYanitiSema,
  type KoclukYaniti,
} from '@kopru/contracts';
import { withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { haftalikPlanlar, kaynakOnerileri } from '../../db/schema.js';
import { gorunenAdlar, requirePermission, type YetkiBaglami } from '../hesap/index.js';
import { degerlendirmeSayfasi, oneriYanitlari } from './degerlendirme-deposu.js';
import {
  analizSatirlari,
  konuAdlari,
  konuTablosu,
  onerileriUret,
  bosHucre,
  hucreEkle,
  type AnalizSatiri,
} from './gunluk-soru-analiz.js';
import { haftalikOzetUret } from './gunluk-soru-ozet.js';
import { kiraci, yetkiAl } from './odev-deposu.js';
import { gorevleriListele, ogrenciBul, ogrenciParam, ozetHesapla } from './plan-deposu.js';
import { haftaBaslangici, planBugunu, tarihEkle } from './plan-zaman.js';

/** Konu analizi penceresi (gun) ve kaynak kullanim penceresi. */
const ANALIZ_GUN = 30;
const KAYNAK_GUN = 90;
const KONU_ANALIZI_EN_FAZLA_DERS = 4;
const ZAYIF_KONU_EN_AZ_SORU = 5;
const ZAYIF_KONU_EN_FAZLA = 5;
const LISTE_EN_FAZLA = 20;
const ONERI_EN_FAZLA = 20;

type Kayit = Record<string, unknown>;

const ortalama = (toplam: number, adet: number): number | null =>
  adet === 0 ? null : Math.round((toplam / adet) * 100) / 100;

async function olcekOrtalamalari(
  tx: Tx,
  y: YetkiBaglami,
  ogrenciId: string,
  bugunHafta: string,
): Promise<KoclukYaniti['olcek_ortalamalari']> {
  const ilkHafta = tarihEkle(bugunHafta, -7 * (KOCLUK_ORTALAMA_HAFTA - 1));
  const satirlar = await tx.execute<
    {
      hafta: string;
      sayi: number;
      s1: number | null;
      c1: number;
      s2: number | null;
      c2: number;
      s3: number | null;
      c3: number;
      s4: number | null;
      c4: number;
    } & Kayit
  >(sql`
    select date_trunc('week', donem_baslangic)::date::text as hafta, count(*)::int as sayi,
           sum(calisma_duzeni)::int as s1, count(calisma_duzeni)::int as c1,
           sum(derse_katilim)::int as s2, count(derse_katilim)::int as c2,
           sum(odev_disiplini)::int as s3, count(odev_disiplini)::int as c3,
           sum(anlama_duzeyi)::int as s4, count(anlama_duzeyi)::int as c4
      from ogrenme.ogretmen_degerlendirmeleri
     where kurum_id = ${y.kurumId}::uuid and ogrenci_id = ${ogrenciId}::uuid
       and geri_cekildi_at is null
       and donem_baslangic >= ${ilkHafta}::date and donem_baslangic <= ${tarihEkle(bugunHafta, 6)}::date
     group by 1`);
  const harita = new Map(satirlar.map((s) => [s.hafta, s]));
  const t = { sayi: 0, s: [0, 0, 0, 0], c: [0, 0, 0, 0] };
  const haftalar = Array.from({ length: KOCLUK_ORTALAMA_HAFTA }, (_, i) => {
    const hafta = tarihEkle(ilkHafta, 7 * i);
    const s = harita.get(hafta);
    if (s) {
      t.sayi += s.sayi;
      [s.s1, s.s2, s.s3, s.s4].forEach((v, j) => (t.s[j] = (t.s[j] ?? 0) + (v ?? 0)));
      [s.c1, s.c2, s.c3, s.c4].forEach((v, j) => (t.c[j] = (t.c[j] ?? 0) + v));
    }
    return {
      hafta_baslangic: hafta,
      sayi: s?.sayi ?? 0,
      calisma_duzeni: s ? ortalama(s.s1 ?? 0, s.c1) : null,
      derse_katilim: s ? ortalama(s.s2 ?? 0, s.c2) : null,
      odev_disiplini: s ? ortalama(s.s3 ?? 0, s.c3) : null,
      anlama_duzeyi: s ? ortalama(s.s4 ?? 0, s.c4) : null,
    };
  });
  return {
    haftalar,
    toplam: {
      sayi: t.sayi,
      calisma_duzeni: ortalama(t.s[0] ?? 0, t.c[0] ?? 0),
      derse_katilim: ortalama(t.s[1] ?? 0, t.c[1] ?? 0),
      odev_disiplini: ortalama(t.s[2] ?? 0, t.c[2] ?? 0),
      anlama_duzeyi: ortalama(t.s[3] ?? 0, t.c[3] ?? 0),
    },
  };
}

async function kullanilanKaynaklar(
  tx: Tx,
  y: YetkiBaglami,
  ogrenciId: string,
  bugun: string,
): Promise<KoclukYaniti['kullanilan_kaynaklar']> {
  const bas = tarihEkle(bugun, -(KAYNAK_GUN - 1));
  const kitaplar = await tx.execute<
    {
      kaynak_kitap_id: string;
      ad: string;
      brans_kodu: string;
      cozulen_test: number;
      toplam_test: number;
      kayit_sayisi: number;
      cozulen_soru: number;
      son_kullanim_gun: string;
    } & Kayit
  >(sql`
    select kb.id as kaynak_kitap_id, kb.ad, kb.brans_kodu,
           count(distinct k.kaynak_test_id)::int as cozulen_test,
           (select count(*)::int from ogrenme.kaynak_kitap_testleri x where x.kitap_id = kb.id) as toplam_test,
           count(*)::int as kayit_sayisi, sum(k.toplam)::int as cozulen_soru,
           max(k.gun)::text as son_kullanim_gun
      from ogrenme.gunluk_soru_kayitlari k
      join ogrenme.kaynak_kitap_testleri t on t.id = k.kaynak_test_id
      join ogrenme.kaynak_kitaplar kb on kb.id = t.kitap_id
     where k.kurum_id = ${y.kurumId}::uuid and k.ogrenci_id = ${ogrenciId}::uuid
     group by kb.id, kb.ad, kb.brans_kodu
    having max(k.gun) >= ${bas}::date
     order by max(k.gun) desc, kb.ad
     limit ${LISTE_EN_FAZLA}`);
  const serbest = await tx.execute<
    { ad: string; kayit_sayisi: number; son_kullanim_gun: string } & Kayit
  >(sql`
    select min(btrim(k.kaynak_metin)) as ad, count(*)::int as kayit_sayisi, max(k.gun)::text as son_kullanim_gun
      from ogrenme.gunluk_soru_kayitlari k
     where k.kurum_id = ${y.kurumId}::uuid and k.ogrenci_id = ${ogrenciId}::uuid
       and k.kaynak_metin is not null and k.gun >= ${bas}::date
     group by lower(btrim(k.kaynak_metin))
     order by max(k.gun) desc, 1
     limit ${LISTE_EN_FAZLA}`);
  const odevler = await tx.execute<
    { ad: string; odev_sayisi: number; son_kullanim_gun: string } & Kayit
  >(sql`
    select min(btrim(o.kaynak)) as ad, count(*)::int as odev_sayisi,
           max((coalesce(s.teslim_at, o.yayin_at, o.created_at) at time zone 'Europe/Istanbul')::date)::text as son_kullanim_gun
      from ogrenme.ogrenci_odevleri s
      join ogrenme.odevler o on o.id = s.odev_id
     where s.kurum_id = ${y.kurumId}::uuid and s.ogrenci_id = ${ogrenciId}::uuid
       and s.durum <> 'iptal' and o.kaynak is not null and btrim(o.kaynak) <> ''
       and (coalesce(s.teslim_at, o.yayin_at, o.created_at) at time zone 'Europe/Istanbul')::date >= ${bas}::date
     group by lower(btrim(o.kaynak))
     order by 3 desc, 1
     limit ${LISTE_EN_FAZLA}`);
  return {
    kitaplar: kitaplar.map((k) => ({ ...k })),
    serbest: serbest.map((k) => ({ ...k })),
    odevler: odevler.map((k) => ({ ...k })),
  };
}

async function konuAnalizi(
  tx: Tx,
  y: YetkiBaglami,
  ogrenciId: string,
  bugun: string,
): Promise<KoclukYaniti['konu_analizi']> {
  const bas = tarihEkle(bugun, -(ANALIZ_GUN - 1));
  const satirlar = await analizSatirlari(tx, y.kurumId, [ogrenciId], { bas, bit: bugun });
  const adlar = await konuAdlari(
    tx,
    satirlar.map((s) => s.konu_id),
  );
  const toplam = bosHucre();
  const dersler = new Map<string, AnalizSatiri[]>();
  for (const s of satirlar) {
    hucreEkle(toplam, s);
    dersler.set(s.brans_kodu, [...(dersler.get(s.brans_kodu) ?? []), s]);
  }
  const hacim = (liste: AnalizSatiri[]) => liste.reduce((a, s) => a + s.cozulen, 0);
  const secilen = [...dersler.entries()]
    .sort(([, a], [, b]) => hacim(b) - hacim(a))
    .slice(0, KONU_ANALIZI_EN_FAZLA_DERS);
  const bransler = [];
  for (const [brans, liste] of secilen) {
    const { konular, toplam: dersToplam } = konuTablosu(liste, adlar);
    const zayif = konular
      .filter((k) => k.toplam.cozulen >= ZAYIF_KONU_EN_AZ_SORU)
      .sort((a, b) => (a.toplam.basari ?? 1) - (b.toplam.basari ?? 1))
      .slice(0, ZAYIF_KONU_EN_FAZLA);
    bransler.push({
      brans_kodu: brans,
      toplam: dersToplam,
      zayif_konular: zayif,
      oneriler: await onerileriUret(tx, y.kurumId, ogrenciId, brans, konular, bugun),
    });
  }
  return {
    bas,
    bit: bugun,
    toplam,
    haftalik_ozet: await haftalikOzetUret(tx, y.kurumId, ogrenciId, haftaBaslangici(bugun)),
    bransler,
  };
}

async function planOdev(
  tx: Tx,
  y: YetkiBaglami,
  ogrenciId: string,
  hafta: string,
): Promise<KoclukYaniti['plan_odev']> {
  const [plan] = await tx
    .select()
    .from(haftalikPlanlar)
    .where(
      and(
        eq(haftalikPlanlar.kurum_id, y.kurumId),
        eq(haftalikPlanlar.ogrenci_id, ogrenciId),
        eq(haftalikPlanlar.hafta_baslangic, hafta),
      ),
    );
  let planOzeti: KoclukYaniti['plan_odev']['plan'] = null;
  if (plan) {
    const o = ozetHesapla(plan, await gorevleriListele(tx, plan.id));
    planOzeti = {
      plan_id: plan.id,
      hafta_baslangic: plan.hafta_baslangic,
      durum: plan.durum as 'taslak' | 'yayinda',
      gorev_sayisi: o.toplam.gorev_sayisi,
      tamam_sayisi: o.toplam.tamam_sayisi,
      soru: o.toplam.soru,
      dakika: o.toplam.dakika,
    };
  }
  const [od] = await tx.execute<
    {
      acik: number;
      geciken: number;
      teslim_edildi: number;
      inceleme_bekleyen: number;
    } & Kayit
  >(sql`
    select count(*) filter (where durum in ('atandi', 'tekrar_istendi'))::int as acik,
           count(*) filter (where durum in ('atandi', 'tekrar_istendi') and son_teslim_at < now())::int as geciken,
           count(*) filter (where teslim_at >= now() - interval '7 days')::int as teslim_edildi,
           count(*) filter (where durum = 'teslim_edildi')::int as inceleme_bekleyen
      from ogrenme.ogrenci_odevleri
     where kurum_id = ${y.kurumId}::uuid and ogrenci_id = ${ogrenciId}::uuid and durum <> 'iptal'`);
  return {
    plan: planOzeti,
    odev: {
      acik: od?.acik ?? 0,
      geciken: od?.geciken ?? 0,
      teslim_edildi: od?.teslim_edildi ?? 0,
      inceleme_bekleyen: od?.inceleme_bekleyen ?? 0,
    },
  };
}

/** Ogrenci koclukgorunumu: tek istek, tek islem; yalniz personel. */
export const koclukYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;

  app.get(
    '/kurumlar/:kurum_id/ogrenciler/:ogrenci_id/kocluk',
    {
      preHandler: requirePermission('kocluk.oku', { scope: 'grup' }),
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrenci kocluk gorunumu (personel; ogretmen yalniz kendi ogrencileri, kapsam disi 404; ogrenci rolu 403): (1) tum ogretmenlerin degerlendirme zaman cizelgesi (ilk sayfa, gorunurluk isaretli; devami `degerlendirmeler` liste ucundan), (2) son 4 haftanin olcek ortalamalari, (3) kullanilan kaynaklar (gunluk kayit ve odevlerden, son 90 gun; kitap ilerlemesi), (4) onerilen kaynaklar ve baslama durumu, (5) son 30 gun konu analizi ozeti, zayif konular ve sistem onerileri (G1 fonksiyonlari), (6) bu haftanin plani ve odev durumu. Geri cekilen degerlendirme ve oneriler yoktur. Hedef: 2 sn.',
        params: ogrenciParam,
        querystring: KoclukSorguSema,
        response: { 200: KoclukYanitiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const ogrenciId = request.params.ogrenci_id;
      const bugun = planBugunu();
      const hafta = haftaBaslangici(bugun);
      return withTenant(db, kiraci(y), async (tx) => {
        await ogrenciBul(tx, y, ogrenciId, false);
        const adlar = await gorunenAdlar(tx, [ogrenciId]);
        const degerlendirmeler = await degerlendirmeSayfasi(tx, y, ogrenciId, {
          limit: request.query.limit,
          imlec: undefined,
          geriCekilenler: false,
        });
        const oneriSatirlari = await tx
          .select()
          .from(kaynakOnerileri)
          .where(
            and(
              eq(kaynakOnerileri.kurum_id, y.kurumId),
              eq(kaynakOnerileri.ogrenci_id, ogrenciId),
              isNull(kaynakOnerileri.geri_cekildi_at),
            ),
          )
          .orderBy(desc(kaynakOnerileri.id))
          .limit(ONERI_EN_FAZLA);
        return {
          ogrenci_id: ogrenciId,
          ogrenci_ad: adlar.get(ogrenciId) ?? null,
          degerlendirmeler,
          olcek_ortalamalari: await olcekOrtalamalari(tx, y, ogrenciId, hafta),
          kullanilan_kaynaklar: await kullanilanKaynaklar(tx, y, ogrenciId, bugun),
          oneriler: await oneriYanitlari(tx, y, oneriSatirlari),
          konu_analizi: await konuAnalizi(tx, y, ogrenciId, bugun),
          plan_odev: await planOdev(tx, y, ogrenciId, hafta),
        };
      });
    },
  );

  return Promise.resolve();
};
