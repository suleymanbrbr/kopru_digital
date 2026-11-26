import {
  AnalizSorguSema,
  AnalizYanitiSema,
  GorevVerGirdiSema,
  GorevVerYanitiSema,
  HaftalikOzetSema,
  HaftalikOzetSorguSema,
  HucreDetaySema,
  HucreSorguSema,
  SinifAnaliziSema,
  SinifSorguSema,
  errorCodes,
  izinVarMi,
  type AnalizZorlugu,
  type HucreDetaySema as HucreDetayTipi,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { and, eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { z } from 'zod';

import { gruplar, odevler } from '../../db/schema.js';
import {
  grupEtkinOgrencileri,
  grupKapsami,
  requirePermission,
  type YetkiBaglami,
} from '../hesap/index.js';
import {
  aralikCoz,
  analizSatirlari,
  konuAdlari,
  konuTablosu,
  onerileriUret,
  sinifTablosu,
} from './gunluk-soru-analiz.js';
import { gorevBasligi } from './gunluk-soru-bant.js';
import { bransVeKonuDogrula } from './gunluk-soru-deposu.js';
import { haftalikOzetUret } from './gunluk-soru-ozet.js';
import {
  atananSayisi,
  hedefiDogrula,
  kiraci,
  kurumParam,
  odevDenetimiYaz,
  ogrenciSatirlariniAc,
  olayBaglami,
  yayinlandiOlayiYaz,
  yetkiAl,
} from './odev-deposu.js';
import {
  gorevleriEkle,
  haftaYazilabilirOlmali,
  ogrenciBul,
  ogrenciOlmali,
  ogrenciParam,
  planDenetimiYaz,
  planModuluAcikOlmali,
  planiAcYadaGetir,
} from './plan-deposu.js';
import { haftaBaslangici, planBugunu, tarihEkle } from './plan-zaman.js';
import { okumaAdresleriAl } from './soru-medya.js';

type OgrenciSorgu = z.infer<typeof AnalizSorguSema>;

/** Konu analizi, hucre ayrintisi, sinif gorunumu, haftalik ozet ve oneriden gorev verme. */
export const gunlukSoruAnalizYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const okuKendi = { preHandler: requirePermission('gunluk_soru.oku', { scope: 'kendi' }) };
  const okuPersonel = { preHandler: requirePermission('gunluk_soru.oku', { scope: 'grup' }) };

  /** Analiz govdesi; oneriler yalniz personel (`oneriler = true`). */
  async function analizUret(
    tx: Tx,
    y: YetkiBaglami,
    ogrenciId: string,
    q: OgrenciSorgu,
    oneriler: boolean,
  ) {
    const aralik = aralikCoz(q);
    const satirlar = await analizSatirlari(tx, y.kurumId, [ogrenciId], {
      bransKodu: q.brans_kodu,
      ...aralik,
    });
    const adlar = await konuAdlari(
      tx,
      satirlar.map((s) => s.konu_id),
    );
    const { konular, toplam } = konuTablosu(satirlar, adlar);
    return {
      ogrenci_id: ogrenciId,
      brans_kodu: q.brans_kodu,
      ...aralik,
      konular,
      toplam,
      ...(oneriler
        ? { oneriler: await onerileriUret(tx, y.kurumId, ogrenciId, q.brans_kodu, konular) }
        : {}),
    };
  }

  /** Hucre ayrintisi: kayitlar + fotograf okuma adresleri (medya ic ucu; yetki karari burada). */
  async function hucreUret(
    tx: Tx,
    y: YetkiBaglami,
    ogrenciId: string,
    q: z.infer<typeof HucreSorguSema>,
  ): Promise<z.infer<typeof HucreDetayTipi> & { dosyaIdleri: string[] }> {
    const { bas, bit } = aralikCoz(q);
    const gunlukMu = q.zorluk !== 'belirtilmemis';
    const odevMu = q.zorluk === undefined || q.zorluk === 'belirtilmemis';
    const zorlukKosulu = q.zorluk && gunlukMu ? sql`and k.zorluk = ${q.zorluk}` : sql``;
    const satirlar = await tx.execute<
      {
        kaynak: 'gunluk' | 'odev';
        id: string;
        gun: string;
        zorluk: AnalizZorlugu;
        kaynak_adi: string | null;
        dogru: number;
        yanlis: number;
        bos: number;
      } & Record<string, unknown>
    >(sql`
      select * from (
        select 'gunluk'::text as kaynak, k.id, k.gun::text as gun, k.zorluk,
               coalesce(kt.ad_tam, k.kaynak_metin) as kaynak_adi,
               k.dogru, k.yanlis, k.bos, k.created_at as sira
          from ogrenme.gunluk_soru_kayitlari k
          left join lateral (
            select kb.ad || ' · ' || t.ad as ad_tam
              from ogrenme.kaynak_kitap_testleri t join ogrenme.kaynak_kitaplar kb on kb.id = t.kitap_id
             where t.id = k.kaynak_test_id) kt on true
         where ${gunlukMu ? sql`true` : sql`false`}
           and k.kurum_id = ${y.kurumId}::uuid and k.ogrenci_id = ${ogrenciId}::uuid
           and k.brans_kodu = ${q.brans_kodu} and k.konu_id = ${q.konu_id}::uuid
           and k.gun >= ${bas}::date and k.gun <= ${bit}::date ${zorlukKosulu}
        union all
        select 'odev'::text, s.id, (s.teslim_at at time zone 'Europe/Istanbul')::date::text, 'belirtilmemis',
               o.baslik,
               s.dogru_sayisi,
               coalesce(s.yanlis_sayisi, greatest(0, s.yapilan_soru_sayisi - s.dogru_sayisi - coalesce(s.bos_sayisi, 0))),
               coalesce(s.bos_sayisi, 0), s.teslim_at
          from ogrenme.ogrenci_odevleri s join ogrenme.odevler o on o.id = s.odev_id
         where ${odevMu ? sql`true` : sql`false`}
           and s.kurum_id = ${y.kurumId}::uuid and s.ogrenci_id = ${ogrenciId}::uuid
           and s.durum in ('teslim_edildi', 'incelendi', 'tekrar_istendi')
           and s.dogru_sayisi is not null and s.yapilan_soru_sayisi > 0
           and o.brans_kodu = ${q.brans_kodu} and o.konu_id = ${q.konu_id}::uuid
           and (s.teslim_at at time zone 'Europe/Istanbul')::date >= ${bas}::date
           and (s.teslim_at at time zone 'Europe/Istanbul')::date <= ${bit}::date
      ) x order by x.sira desc, x.id desc limit 500`);
    const gunlukIdleri = satirlar.filter((s) => s.kaynak === 'gunluk').map((s) => s.id);
    const dosyalar =
      gunlukIdleri.length === 0
        ? []
        : await tx.execute<
            { kayit_id: string; medya_dosya_id: string } & Record<string, unknown>
          >(sql`
            select kayit_id, medya_dosya_id from ogrenme.gunluk_soru_dosyalari
             where kurum_id = ${y.kurumId}::uuid and kayit_id in (${sql.join(
               gunlukIdleri.map((i) => sql`${i}::uuid`),
               sql`, `,
             )}) order by kayit_id, sira`);
    return {
      ogrenci_id: ogrenciId,
      konu_id: q.konu_id,
      kayitlar: satirlar.map((s) => ({
        kaynak: s.kaynak,
        id: s.id,
        gun: s.gun,
        zorluk: s.zorluk,
        kaynak_adi: s.kaynak_adi,
        dogru: s.dogru,
        yanlis: s.yanlis,
        bos: s.bos,
        toplam: s.dogru + s.yanlis + s.bos,
        dosyalar: dosyalar
          .filter((d) => d.kayit_id === s.id)
          .map((d) => ({ medya_dosya_id: d.medya_dosya_id, adres: null })),
      })),
      fotograf_adresleri_alinamadi: false,
      dosyaIdleri: dosyalar.map((d) => d.medya_dosya_id),
    };
  }

  async function hucreYaniti(
    y: YetkiBaglami,
    ogrenciId: string,
    q: z.infer<typeof HucreSorguSema>,
  ): Promise<z.infer<typeof HucreDetayTipi>> {
    const { dosyaIdleri, ...detay } = await withTenant(db, kiraci(y), async (tx) => {
      if (y.rol !== 'ogrenci') await ogrenciBul(tx, y, ogrenciId, false);
      return hucreUret(tx, y, ogrenciId, q);
    });
    if (dosyaIdleri.length === 0) return detay;
    const { adresler, alinamadi } = await okumaAdresleriAl(app, y.kurumId, dosyaIdleri);
    return {
      ...detay,
      kayitlar: detay.kayitlar.map((k) => ({
        ...k,
        dosyalar: k.dosyalar.map((d) => ({
          medya_dosya_id: d.medya_dosya_id,
          adres: adresler.get(d.medya_dosya_id) ?? null,
        })),
      })),
      fotograf_adresleri_alinamadi: alinamadi,
    };
  }

  // --- Ogrencinin kendi analizi (oneri yok) --------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/gunluk-soru/analiz',
    {
      ...okuKendi,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrencinin kendi konu x zorluk analizi (ders + `donem` 7/30/donem ya da `bas`/`bit`). Kaynaklar: gunluk kayitlar ve konulu odev teslimleri (zorluk "belirtilmemis"). Ogrenci yanitinda ONERI YOKTUR.',
        params: kurumParam,
        querystring: AnalizSorguSema,
        response: { 200: AnalizYanitiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y);
      return withTenant(db, kiraci(y), (tx) => analizUret(tx, y, y.uyelikId, request.query, false));
    },
  );

  app.get(
    '/kurumlar/:kurum_id/gunluk-soru/analiz/hucre',
    {
      ...okuKendi,
      schema: {
        tags: ['ogrenme'],
        summary: 'Ogrencinin kendi hucre ayrintisi: konu (ve zorluk) icin kayitlar ve fotograflar.',
        params: kurumParam,
        querystring: HucreSorguSema,
        response: { 200: HucreDetaySema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      ogrenciOlmali(y);
      return hucreYaniti(y, y.uyelikId, request.query);
    },
  );

  // --- Personel: ogrenci analizi --------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/ogrenciler/:ogrenci_id/gunluk-soru/analiz',
    {
      ...okuPersonel,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrenci konu analizi (ogretmen: kendi ogrencileri; yonetici/sahip: kurum; kapsam disi 404): konu x zorluk tablosu (cozulen, dogru, yanlis, bos, basari), konu basina zorluk bandi tespiti (`veri_az` / `tespit_yok` / `zorlaniyor`) ve `oneriler` (gorev oner, birebir ders gerekebilir). Oneriler kural tabanlidir, ogretmen onaylidir ve yalniz bu yanitta bulunur.',
        params: ogrenciParam,
        querystring: AnalizSorguSema,
        response: { 200: AnalizYanitiSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        await ogrenciBul(tx, y, request.params.ogrenci_id, false);
        return analizUret(tx, y, request.params.ogrenci_id, request.query, true);
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/ogrenciler/:ogrenci_id/gunluk-soru/analiz/hucre',
    {
      ...okuPersonel,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Hucre ayrintisi: secilen konu (ve zorluk) icin gunluk kayitlar, odev teslimleri ve fotograflarin okuma adresleri (medya ic ucu, 10 dk). Medya yanit vermezse `fotograf_adresleri_alinamadi=true`.',
        params: ogrenciParam,
        querystring: HucreSorguSema,
        response: { 200: HucreDetaySema },
      },
    },
    async (request) => hucreYaniti(yetkiAl(request), request.params.ogrenci_id, request.query),
  );

  // --- Personel: sinif/grup gorunumu ---------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/gunluk-soru/sinif-analizi',
    {
      ...okuPersonel,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Grup/sinif gorunumu: konu bazinda toplam ve zorluk dagilimi, konuda kayit giren ve zorlanan ogrenci sayisi, en cok zorlanilan konular (en az 10 soru, basari < %70). Ogretmen yalniz atandigi grubu (disi 404).',
        params: kurumParam,
        querystring: SinifSorguSema,
        response: { 200: SinifAnaliziSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const q = request.query;
      const aralik = aralikCoz(q);
      return withTenant(db, kiraci(y), async (tx) => {
        const [g] = await tx
          .select({ id: gruplar.id })
          .from(gruplar)
          .where(
            and(eq(gruplar.id, q.grup_id), eq(gruplar.kurum_id, y.kurumId), grupKapsami(tx, y)),
          );
        if (!g) throw new AppError(404, errorCodes.notFound, 'Grup bulunamadı.');
        const ogrenciler = await grupEtkinOgrencileri(tx, g.id);
        const satirlar = await analizSatirlari(tx, y.kurumId, ogrenciler, {
          bransKodu: q.brans_kodu,
          ...aralik,
        });
        const adlar = await konuAdlari(
          tx,
          satirlar.map((s) => s.konu_id),
        );
        const t = sinifTablosu(satirlar, adlar);
        return {
          grup_id: g.id,
          brans_kodu: q.brans_kodu,
          ...aralik,
          ogrenci_sayisi: ogrenciler.length,
          konular: t.konular,
          en_cok_zorlanilan: t.enCokZorlanilan,
          toplam: t.toplam,
        };
      });
    },
  );

  // --- Personel: haftalik ozet ----------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/ogrenciler/:ogrenci_id/gunluk-soru/haftalik-ozet',
    {
      ...okuPersonel,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Ogrenci karti haftalik ozeti (Pazartesi baslar, Europe/Istanbul): cozulen soru, en zayif 3 konu (en az 5 soru) ve tum konular birlikte zorluk bandi degisimi (onceki hafta ile). Tum dersler birlikte.',
        params: ogrenciParam,
        querystring: HaftalikOzetSorguSema,
        response: { 200: HaftalikOzetSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const hafta = haftaBaslangici(request.query.hafta ?? planBugunu());
      return withTenant(db, kiraci(y), async (tx) => {
        await ogrenciBul(tx, y, request.params.ogrenci_id, false);
        return haftalikOzetUret(tx, y.kurumId, request.params.ogrenci_id, hafta);
      });
    },
  );

  // --- Personel: gorev ver --------------------------------------------------------------------

  app.post(
    '/kurumlar/:kurum_id/ogrenciler/:ogrenci_id/gunluk-soru/gorev-ver',
    {
      ...okuPersonel,
      schema: {
        tags: ['ogrenme'],
        summary:
          'Oneriden tek tikla gorev: `plan_gorevi` (ogrencinin `gun`ku (varsayilan yarin) haftalik planina "konu: zorluk seviyeden N soru" gorevi; plan yoksa yayinda acilir, taslak plan varsa gorev taslaga eklenir ve `plan_durum=taslak` doner) ya da `odev` (tek ogrencilik yayinda odev, son teslim varsayilan 3 gun). Mevcut plan ve odev servis fonksiyonlari kullanilir; yetki: `plan.gorev.yaz` / `odev.ver`, kapsam disi ogrenci 404, kilitli hafta 409 `plan_kilitli`.',
        params: ogrenciParam,
        body: GorevVerGirdiSema,
        response: { 201: GorevVerYanitiSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      const ogrenciId = request.params.ogrenci_id;
      const gerekli = g.tur === 'plan_gorevi' ? 'plan.gorev.yaz' : 'odev.ver';
      if (!izinVarMi(y.rol, gerekli, 'grup')) {
        throw new AppError(403, errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
      }
      const baglam = olayBaglami(y, request.correlationId);
      const sonuc = await withTenant(db, kiraci(y), async (tx) => {
        await ogrenciBul(tx, y, ogrenciId);
        const konu = await bransVeKonuDogrula(tx, g.brans_kodu, g.konu_id);
        const baslik = gorevBasligi(konu.ad, g.zorluk, g.soru_sayisi);

        if (g.tur === 'plan_gorevi') {
          await planModuluAcikOlmali(tx, y, ogrenciId);
          const gun = g.gun ?? tarihEkle(planBugunu(), 1);
          const hafta = haftaBaslangici(gun);
          haftaYazilabilirOlmali(hafta);
          const { plan, yeni } = await planiAcYadaGetir(tx, y, ogrenciId, hafta, {
            durum: 'yayinda',
          });
          const [gorev] = await gorevleriEkle(
            tx,
            y,
            [plan],
            [
              {
                gun,
                brans_kodu: g.brans_kodu,
                konu_id: g.konu_id,
                baslik,
                hedef_turu: 'soru',
                hedef_miktar: g.soru_sayisi,
                sira: 0,
              },
            ],
          );
          if (!gorev) throw new Error('görev eklenemedi');
          await planDenetimiYaz(
            tx,
            y,
            request.ip,
            'plan.gorev_ver',
            'plan_gorevi',
            gorev.id,
            null,
            {
              ogrenci_id: ogrenciId,
              brans_kodu: g.brans_kodu,
              konu_id: g.konu_id,
              zorluk: g.zorluk,
              soru_sayisi: g.soru_sayisi,
              plan_yeni: yeni,
            },
          );
          return {
            tur: 'plan_gorevi' as const,
            plan_id: plan.id,
            gorev_id: gorev.id,
            hafta_baslangic: hafta,
            gun,
            plan_durum: plan.durum as 'taslak' | 'yayinda',
          };
        }

        // Odev: tek ogrenci hedefi (modul ve kapsam `hedefiDogrula` icinde).
        const hedefId = await hedefiDogrula(tx, y, 'ogrenci', ogrenciId);
        const sonTeslim = g.son_teslim_at
          ? new Date(g.son_teslim_at)
          : new Date(Date.now() + 3 * 86_400_000);
        if (sonTeslim.getTime() <= Date.now()) {
          throw new AppError(422, errorCodes.validation, 'Son teslim tarihi geçmişte olamaz.');
        }
        const simdi = new Date();
        const [o] = await tx
          .insert(odevler)
          .values({
            id: uuidv7(),
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            baslik,
            aciklama: null,
            brans_kodu: g.brans_kodu,
            konu_id: g.konu_id,
            tur: 'soru',
            kaynak: null,
            hedef_turu: 'ogrenci',
            hedef_id: hedefId,
            veren_id: y.uyelikId,
            son_teslim_at: sonTeslim,
            hedef_soru_sayisi: g.soru_sayisi,
            fotograf_gerekli: false,
            durum: 'yayinda',
            yayin_at: simdi,
            fan_out_durum: 'calisiyor',
          })
          .returning();
        if (!o) throw new Error('ödev oluşturulamadı');
        const eklenen = await ogrenciSatirlariniAc(tx, y, o, [ogrenciId]);
        const sayi = await atananSayisi(tx, o.id);
        const [son] = await tx
          .update(odevler)
          .set({ fan_out_durum: 'tamamlandi', atanan_sayisi: sayi })
          .where(eq(odevler.id, o.id))
          .returning();
        if (!son) throw new Error('ödev yayınlanamadı');
        await yayinlandiOlayiYaz(tx, baglam, son, eklenen);
        await odevDenetimiYaz(tx, y, request.ip, 'odev.gunluk_soru_oneri', 'odev', o.id, null, {
          hedef_id: hedefId,
          brans_kodu: g.brans_kodu,
          konu_id: g.konu_id,
          zorluk: g.zorluk,
          soru_sayisi: g.soru_sayisi,
        });
        return { tur: 'odev' as const, odev_id: o.id, son_teslim_at: sonTeslim.toISOString() };
      });
      return reply.status(201).send(sonuc);
    },
  );

  return Promise.resolve();
};
