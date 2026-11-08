import {
  DersDetaySema,
  DersListeYanitSema,
  DersListeSorguSema,
  DersOlusturGirdiSema,
  DersOlusturYanitSema,
  SeriOlusturGirdiSema,
  SeriOlusturYanitSema,
  errorCodes,
  tekrarKuraliCoz,
  tekrarKuraliYaz,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin } from '@kopru/service-kit';
import { and, asc, eq, exists, gt, gte, lt, sql, type SQL } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { dersKatilimcilari, dersSerileri, dersler } from '../../db/schema.js';
import { grupEtkinOgrencileri, requirePermission } from '../hesap/index.js';
import {
  cakisanYaniti,
  dersBul,
  dersDenetimiYaz,
  dersDetayi,
  dersKapsami,
  dersOlayiYaz,
  dersYaniti,
  katilimciSayilari,
  ogretmenCakismalari,
  ogrenciUyarilari,
  seriYaniti,
} from './ders-deposu.js';
import {
  aktifGrupBul,
  bransCoz,
  cakismaHatasi,
  cakismaKorumali,
  dersParam,
  kiraci,
  kurumParam,
  kurumSaatDilimi,
  ogretmenCoz,
  olayBaglami,
  seriBul,
  yetkiAl,
  type CakismaNiyeti,
} from './ders-ortak.js';
import { bitisleSinirla, SERI_UFUK_GUN, seriDerslerUret } from './seri-uretimi.js';
import { bugunYerel, tarihEkle, yerelDenUtc } from './zaman.js';

const SEKIZ_SAAT_MS = 8 * 3_600_000;

function imlecCoz(imlec: string): { at: Date; id: string } {
  try {
    const [at, id] = Buffer.from(imlec, 'base64url').toString('utf8').split('|');
    const tarih = new Date(at ?? '');
    if (!id || Number.isNaN(tarih.getTime())) throw new Error('imlec');
    return { at: tarih, id };
  } catch {
    throw new AppError(400, errorCodes.validation, 'İmleç geçersiz.');
  }
}

const imlecYaz = (d: { baslangic_at: Date; id: string }) =>
  Buffer.from(`${d.baslangic_at.toISOString()}|${d.id}`, 'utf8').toString('base64url');

/** Ders olusturma ve okuma uc noktalari (`/v1/ders/kurumlar/:kurum_id/dersler|seriler`). */
export const dersYollari: ServicePlugin = (app) => {
  const { db } = app.kimlik;
  const yaz = { preHandler: requirePermission('takvim.yaz', { scope: 'grup' }) };
  const oku = { preHandler: requirePermission('takvim.oku') };

  // --- Tekil ders ------------------------------------------------------------------------

  app.post(
    '/kurumlar/:kurum_id/dersler',
    {
      ...yaz,
      schema: {
        tags: ['ders'],
        summary:
          'Tekil ders olustur. Ogretmen cakismasinda 409 ders_cakismasi; cakisma_onayli:true ile yazilir. Ogrenci cakismasi yanitta uyaridir.',
        params: kurumParam,
        body: DersOlusturGirdiSema,
        response: { 201: DersOlusturYanitSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      const baglam = olayBaglami(y, request.correlationId);
      const niyet: { current: CakismaNiyeti | null } = { current: null };
      const sonuc = await cakismaKorumali(db, y, niyet, () =>
        withTenant(db, kiraci(y), async (tx) => {
          const grup = await aktifGrupBul(tx, y, g.grup_id);
          const ogretmenId = await ogretmenCoz(tx, y, g.ogretmen_id);
          const brans = await bransCoz(tx, grup.id, ogretmenId, g.brans_kodu);
          const saatDilimi = await kurumSaatDilimi(tx, y.kurumId);
          if (g.telafi_kaynak_ders_id !== undefined) {
            const [kaynak] = await tx
              .select({ id: dersler.id })
              .from(dersler)
              .where(and(eq(dersler.id, g.telafi_kaynak_ders_id), eq(dersler.kurum_id, y.kurumId)));
            if (!kaynak)
              throw new AppError(404, errorCodes.notFound, 'Telafi kaynağı ders bulunamadı.');
          }

          const baslangic = yerelDenUtc(g.tarih, g.baslangic_saati, saatDilimi);
          const bitis = new Date(baslangic.getTime() + g.sure_dk * 60_000);
          niyet.current = { ogretmenId, araliklar: [{ baslangic, bitis }], haric: [] };
          const { hepsi } = await ogretmenCakismalari(tx, y.kurumId, ogretmenId, [
            { baslangic, bitis },
          ]);
          if (hepsi.length > 0 && !g.cakisma_onayli) throw cakismaHatasi(hepsi);

          const [ders] = await tx
            .insert(dersler)
            .values({
              id: uuidv7(),
              kurum_id: y.kurumId,
              created_by: y.kullaniciId,
              grup_id: grup.id,
              ogretmen_id: ogretmenId,
              brans_kodu: brans,
              konu_id: g.konu_id ?? null,
              baslik: g.baslik ?? null,
              baslangic_at: baslangic,
              bitis_at: bitis,
              ilk_baslangic_at: baslangic,
              telafi: g.telafi || g.telafi_kaynak_ders_id !== undefined,
              telafi_kaynak_ders_id: g.telafi_kaynak_ders_id ?? null,
              online_baglanti: g.online_baglanti ?? null,
              yer: g.yer ?? null,
              cakisma_onayli: hepsi.length > 0,
            })
            .returning();
          if (!ders) throw new Error('ders oluşturulamadı');

          const ogrenciIdleri = await grupEtkinOgrencileri(tx, grup.id);
          if (ogrenciIdleri.length > 0) {
            await tx.insert(dersKatilimcilari).values(
              ogrenciIdleri.map((ogrenciId) => ({
                id: uuidv7(),
                kurum_id: y.kurumId,
                created_by: y.kullaniciId,
                ders_id: ders.id,
                ogrenci_id: ogrenciId,
                tur: 'uye',
              })),
            );
          }
          await dersOlayiYaz(tx, baglam, 'planlandi', ders, ogrenciIdleri);
          await dersDenetimiYaz(tx, y, request.ip, 'ders.olustur', 'ders', ders.id, null, {
            grup_id: grup.id,
            ogretmen_id: ogretmenId,
            katilimci_sayisi: ogrenciIdleri.length,
            cakisma_onayli: hepsi.length > 0,
          });
          const uyari = await ogrenciUyarilari(tx, y.kurumId, ogrenciIdleri, [
            { id: ders.id, baslangic, bitis },
          ]);
          return { ders: await dersDetayi(tx, y, ders), uyari };
        }),
      );
      return reply.status(201).send(sonuc);
    },
  );

  // --- Seri ------------------------------------------------------------------------------

  app.post(
    '/kurumlar/:kurum_id/seriler',
    {
      ...yaz,
      schema: {
        tags: ['ders'],
        summary:
          'Tekrarlayan ders serisi olustur (FREQ=WEEKLY|DAILY, INTERVAL, BYDAY; bitis tarihi veya adet). Dersler 12 hafta ileriye uretilir, kalani gece isi uretir.',
        params: kurumParam,
        body: SeriOlusturGirdiSema,
        response: { 201: SeriOlusturYanitSema },
      },
    },
    async (request, reply) => {
      const y = yetkiAl(request);
      const g = request.body;
      const kural = tekrarKuraliCoz(g.tekrar_kurali);
      if (!kural.ok) throw new AppError(422, errorCodes.validation, kural.hata);
      const baglam = olayBaglami(y, request.correlationId);
      const sonuc = await withTenant(db, kiraci(y), async (tx) => {
        const grup = await aktifGrupBul(tx, y, g.grup_id);
        const ogretmenId = await ogretmenCoz(tx, y, g.ogretmen_id);
        const brans = await bransCoz(tx, grup.id, ogretmenId, g.brans_kodu);
        const saatDilimi = await kurumSaatDilimi(tx, y.kurumId);
        const bugun = bugunYerel(saatDilimi);
        const ufuk = tarihEkle(
          g.baslangic_tarihi > bugun ? g.baslangic_tarihi : bugun,
          SERI_UFUK_GUN,
        );
        const [seri] = await tx
          .insert(dersSerileri)
          .values({
            id: uuidv7(),
            kurum_id: y.kurumId,
            created_by: y.kullaniciId,
            grup_id: grup.id,
            ogretmen_id: ogretmenId,
            brans_kodu: brans,
            baslik: g.baslik ?? null,
            tekrar_kurali: tekrarKuraliYaz(kural.kural),
            baslangic_tarihi: g.baslangic_tarihi,
            bitis_tarihi: g.bitis_tarihi ?? null,
            adet: g.adet ?? null,
            baslangic_saati: g.baslangic_saati,
            sure_dk: g.sure_dk,
            saat_dilimi: saatDilimi,
            online_baglanti: g.online_baglanti ?? null,
            yer: g.yer ?? null,
            uretildi_son_tarih: bitisleSinirla(ufuk, g.bitis_tarihi ?? null),
          })
          .returning();
        if (!seri) throw new Error('seri oluşturulamadı');

        const uretim = await seriDerslerUret(tx, seri, {
          ufuk,
          alt: null,
          cakisma: g.cakisma_onayli ? 'onayla' : 'reddet',
          baglam,
          olusturan: y.kullaniciId,
        });
        const guncelSeri = (await seriBul(tx, seri.id)) ?? seri;
        const uyari = await ogrenciUyarilari(
          tx,
          y.kurumId,
          uretim.ogrenciIdleri,
          uretim.olusan.map((d) => ({ id: d.id, baslangic: d.baslangic_at, bitis: d.bitis_at })),
        );
        await dersDenetimiYaz(
          tx,
          y,
          request.ip,
          'ders.seri_olustur',
          'ders_serisi',
          seri.id,
          null,
          {
            grup_id: grup.id,
            ogretmen_id: ogretmenId,
            tekrar_kurali: seri.tekrar_kurali,
            uretilen_sayisi: uretim.olusan.length,
            atlanan_sayisi: uretim.atlanan.length,
            cakisma_onayli: g.cakisma_onayli,
          },
        );
        return {
          seri: seriYaniti(guncelSeri),
          dersler: uretim.olusan.map((d) => dersYaniti(d, uretim.ogrenciIdleri.length)),
          atlanan: uretim.atlanan,
          cakisanlar: uretim.cakisanlar.map(cakisanYaniti),
          uyari,
        };
      });
      return reply.status(201).send(sonuc);
    },
  );

  // --- Liste ve tekil --------------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/dersler',
    {
      ...oku,
      schema: {
        tags: ['ders'],
        summary:
          'Ders listesi (takvim araligi, en cok 100 gun; anahtar tabanli sayfalama). Kapsam rolun izin kapsamina gore daralir: ogrenci yalniz katilimcisi oldugu dersleri gorur.',
        params: kurumParam,
        querystring: DersListeSorguSema,
        response: { 200: DersListeYanitSema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      const { baslangic, bitis, ogretmen_id, grup_id, ogrenci_id, durum, limit, imlec } =
        request.query;
      const bas = new Date(baslangic);
      const bit = new Date(bitis);
      return withTenant(db, kiraci(y), async (tx) => {
        const kosullar: (SQL | undefined)[] = [
          eq(dersler.kurum_id, y.kurumId),
          dersKapsami(tx, y),
          // Aralikla kesisen dersler. Ders en cok 8 saat surdugu icin alt sinir indeksten daraltir.
          lt(dersler.baslangic_at, bit),
          gt(dersler.bitis_at, bas),
          gte(dersler.baslangic_at, new Date(bas.getTime() - SEKIZ_SAAT_MS)),
        ];
        if (ogretmen_id) kosullar.push(eq(dersler.ogretmen_id, ogretmen_id));
        if (grup_id) kosullar.push(eq(dersler.grup_id, grup_id));
        if (durum) kosullar.push(eq(dersler.durum, durum));
        if (ogrenci_id) {
          kosullar.push(
            exists(
              tx
                .select({ bir: sql`1` })
                .from(dersKatilimcilari)
                .where(
                  and(
                    eq(dersKatilimcilari.ders_id, dersler.id),
                    eq(dersKatilimcilari.ogrenci_id, ogrenci_id),
                  ),
                ),
            ),
          );
        }
        if (imlec) {
          const c = imlecCoz(imlec);
          kosullar.push(
            sql`(${dersler.baslangic_at}, ${dersler.id}) > (${c.at.toISOString()}::timestamptz, ${c.id}::uuid)`,
          );
        }
        const satirlar = await tx
          .select()
          .from(dersler)
          .where(and(...kosullar))
          .orderBy(asc(dersler.baslangic_at), asc(dersler.id))
          .limit(limit + 1);
        const sayfa = satirlar.slice(0, limit);
        const sayilar = await katilimciSayilari(
          tx,
          sayfa.map((d) => d.id),
        );
        const son = sayfa.at(-1);
        return {
          dersler: sayfa.map((d) => dersYaniti(d, sayilar.get(d.id) ?? 0)),
          sonraki_imlec: satirlar.length > limit && son ? imlecYaz(son) : null,
        };
      });
    },
  );

  app.get(
    '/kurumlar/:kurum_id/dersler/:id',
    {
      ...oku,
      schema: {
        tags: ['ders'],
        summary:
          'Tekil ders ve katilimcilari (kapsam disi: 404). Ogrenci rolunde yalniz kendisi gorunur.',
        params: dersParam,
        response: { 200: DersDetaySema },
      },
    },
    async (request) => {
      const y = yetkiAl(request);
      return withTenant(db, kiraci(y), async (tx) => {
        const d = await dersBul(tx, y, request.params.id);
        return dersDetayi(tx, y, d);
      });
    },
  );

  return Promise.resolve();
};
