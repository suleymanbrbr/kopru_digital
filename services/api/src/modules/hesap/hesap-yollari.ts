import {
  BenYanitSema,
  GuncelRizaYanitSema,
  KurumGuncelleGirdiSema,
  KurumOlusturGirdiSema,
  KurumOlusturYanitSema,
  KurumSema,
  ModulAyarlariYanitSema,
  ModulAyariYazGirdiSema,
  ModulAyariYazYanitSema,
  ModulEtkinSorguSema,
  ModulEtkinYanitSema,
  RizaKaydetGirdiSema,
  RizaKaydetYanitSema,
  UyeListeSorguSema,
  UyeListeYanitSema,
  UyelikOzetSema,
  errorCodes,
  hesapKademeDegistiV1,
  hesapKurumDegistiV1,
  hesapModulAyariDegistiV1,
  hesapUyelikDegistiV1,
  kurumAyarlariSema,
  type Actor,
  type Rol,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin } from '@kopru/service-kit';
import { and, asc, eq, gt, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import {
  atamalar,
  grupUyeleri,
  kademeler,
  kullanicilar,
  gruplar,
  kurumlar,
  modulAyarlari,
  subeler,
  uyelikler,
} from '../../db/schema.js';
import { kurumOlusturSistem } from '../../sistem/kurum-olustur.js';
import { kurucuRolleri, kurumYaniti, VARSAYILAN_KADEMELER } from './kurum-deposu.js';
import { modulAcikMi } from './modul-ayarlari.js';
import { olayYaz, type OlayBaglami } from './olaylar.js';
import { onayGerekliMi, rizaDurumu, rizaKaydet } from './riza.js';
import { uyelikleriGetir } from './uyelik-deposu.js';
import { requirePermission } from './yetki.js';

const kurumParam = z.object({ kurum_id: z.uuid() });
const muaf = { rizaMuaf: true } as const;

function auth(request: { auth: { kullaniciId: string } | null }): { kullaniciId: string } {
  if (!request.auth) throw new AppError(401, errorCodes.unauthorized, 'Oturum açmanız gerekiyor.');
  return request.auth;
}

/** Kurum, uyelik, riza ve modul ayari uc noktalari (`/v1/hesap/*`). */
export const hesapYollari: ServicePlugin = (app) => {
  const { kimlik } = app;
  const { db } = kimlik;

  // --- Profil ve riza -------------------------------------------------------------------------

  app.get(
    '/ben',
    {
      config: muaf,
      schema: {
        tags: ['hesap'],
        summary: 'Oturum acan kullanici, riza durumu ve uyelikleri',
        response: { 200: BenYanitSema },
      },
    },
    async (request) => {
      const { kullaniciId } = auth(request);
      const [k] = await db.orm.select().from(kullanicilar).where(eq(kullanicilar.id, kullaniciId));
      if (!k) throw new AppError(401, errorCodes.unauthorized, 'Kullanıcı bulunamadı.');
      const durum = await rizaDurumu(db, kullaniciId, request.auth?.roller ?? []);
      return {
        kullanici: {
          id: k.id,
          gorunen_ad: k.gorunen_ad,
          telefon_e164: k.telefon_e164,
          eposta: k.eposta,
          // NULL sutunlar surucuden donusturulmeden gelir (null); yalnizca true dogrulanmistir
          eposta_dogrulandi:
            k.eposta !== null && (k.eposta_dogrulandi_at as boolean | null) === true,
          dil: k.dil,
        },
        onay_gerekli: onayGerekliMi(durum),
        uyelikler: await uyelikleriGetir(db, kullaniciId),
      };
    },
  );

  app.get(
    '/rizalar/guncel',
    {
      config: muaf,
      schema: {
        tags: ['hesap'],
        summary: 'Guncel KVKK metin surumleri ve kullanicinin onay durumu',
        response: { 200: GuncelRizaYanitSema },
      },
    },
    async (request) => {
      const { kullaniciId } = auth(request);
      const metinler = await rizaDurumu(db, kullaniciId, request.auth?.roller ?? []);
      return { metinler, onay_gerekli: onayGerekliMi(metinler) };
    },
  );

  app.post(
    '/rizalar',
    {
      config: muaf,
      schema: {
        tags: ['hesap'],
        summary: 'KVKK metni icin karar (kabul / ret / geri cekme) kaydet',
        body: RizaKaydetGirdiSema,
        response: { 200: RizaKaydetYanitSema },
      },
    },
    async (request) => {
      const { kullaniciId } = auth(request);
      const rizaId = await rizaKaydet(db, {
        kullaniciId,
        rizaMetniId: request.body.riza_metni_id,
        karar: request.body.karar,
        kaynak: request.body.kaynak,
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      });
      if (!rizaId) throw new AppError(404, errorCodes.notFound, 'Metin bulunamadı.');
      const metinler = await rizaDurumu(db, kullaniciId, request.auth?.roller ?? []);
      return { riza_id: rizaId, karar: request.body.karar, onay_gerekli: onayGerekliMi(metinler) };
    },
  );

  app.get(
    '/uyeliklerim',
    {
      schema: {
        tags: ['hesap'],
        summary: 'Uyeliklerim (tum kurumlar)',
        response: { 200: z.object({ uyelikler: z.array(UyelikOzetSema) }) },
      },
    },
    async (request) => ({ uyelikler: await uyelikleriGetir(db, auth(request).kullaniciId) }),
  );

  // --- Kurum olusturma (onboarding) -----------------------------------------------------------

  app.post(
    '/kurumlar',
    {
      schema: {
        tags: ['hesap'],
        summary: 'Kurum olustur (onboarding): olusturan sahip olur; bireysel ise ogretmen de olur',
        body: KurumOlusturGirdiSema,
        response: { 201: KurumOlusturYanitSema },
      },
    },
    async (request, reply) => {
      const { kullaniciId } = auth(request);
      const girdi = request.body;
      const [kullanici] = await db.orm
        .select({ gorunen_ad: kullanicilar.gorunen_ad })
        .from(kullanicilar)
        .where(eq(kullanicilar.id, kullaniciId));
      const gorunenAd = girdi.gorunen_ad ?? kullanici?.gorunen_ad ?? null;
      const kurumId = uuidv7();
      const actor: Actor = { tur: 'kullanici', id: kullaniciId };
      const baglam: OlayBaglami = { kurumId, actor, correlationId: request.correlationId };
      const roller = kurucuRolleri(girdi.tur);

      const { kurum } = await kurumOlusturSistem(
        kimlik.sistemDb,
        {
          kullaniciId,
          kurumId,
          istekId: request.correlationId.length === 36 ? request.correlationId : undefined,
        },
        async (tx) => {
          const [kurum] = await tx
            .insert(kurumlar)
            .values({
              id: kurumId,
              ad: girdi.ad,
              tur: girdi.tur,
              saat_dilimi: girdi.saat_dilimi,
              olusturan_kullanici_id: kullaniciId,
            })
            .returning();
          if (!kurum) throw new Error('kurum oluşturulamadı');
          await olayYaz(tx, hesapKurumDegistiV1, baglam, {
            kurum_id: kurum.id,
            ad: kurum.ad,
            tur: girdi.tur,
            saat_dilimi: kurum.saat_dilimi,
            durum: 'aktif',
          });

          // Tek sube varsayilani
          await tx
            .insert(subeler)
            .values({ id: uuidv7(), kurum_id: kurumId, ad: 'Merkez', created_by: kullaniciId });

          if (girdi.tur !== 'bireysel') {
            for (const [ad, seviye] of VARSAYILAN_KADEMELER) {
              const kademeId = uuidv7();
              await tx.insert(kademeler).values({
                id: kademeId,
                kurum_id: kurumId,
                ad,
                seviye,
                sira: seviye,
                created_by: kullaniciId,
              });
              await olayYaz(tx, hesapKademeDegistiV1, baglam, {
                kademe_id: kademeId,
                ad,
                seviye,
                arsivlendi: false,
              });
            }
          }

          for (const rol of roller) {
            const uyelikId = uuidv7();
            await tx.insert(uyelikler).values({
              id: uyelikId,
              kurum_id: kurumId,
              kullanici_id: kullaniciId,
              rol,
              durum: 'aktif',
              gorunen_ad: gorunenAd,
              katildi_at: new Date(),
              created_by: kullaniciId,
            });
            await olayYaz(tx, hesapUyelikDegistiV1, baglam, {
              uyelik_id: uyelikId,
              kullanici_id: kullaniciId,
              rol,
              durum: 'aktif',
              sube_id: null,
              kademe_id: null,
            });
          }
          return { kurum };
        },
      );

      const tumu = await uyelikleriGetir(db, kullaniciId);
      return reply.status(201).send({
        kurum: kurumYaniti(kurum),
        uyelikler: tumu.filter((u) => u.kurum_id === kurumId),
      });
    },
  );

  // --- Kurum ----------------------------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id',
    {
      preHandler: requirePermission('kurum.oku'),
      schema: {
        tags: ['hesap'],
        summary: 'Kurum bilgileri',
        params: kurumParam,
        response: { 200: KurumSema },
      },
    },
    async (request) => {
      const y = request.yetki;
      if (!y) throw new AppError(403, errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
      const [satir] = await withTenant(
        db,
        { kurumId: y.kurumId, kullaniciId: y.kullaniciId },
        (tx) => tx.select().from(kurumlar).where(eq(kurumlar.id, y.kurumId)),
      );
      if (!satir) throw new AppError(404, errorCodes.notFound, 'Kurum bulunamadı.');
      return kurumYaniti(satir);
    },
  );

  app.patch(
    '/kurumlar/:kurum_id',
    {
      preHandler: requirePermission('kurum.ayar.yaz', { scope: 'kurum' }),
      schema: {
        tags: ['hesap'],
        summary: 'Kurum temel bilgileri: ad, saat dilimi, logo adresi, vurgu rengi',
        params: kurumParam,
        body: KurumGuncelleGirdiSema,
        response: { 200: KurumSema },
      },
    },
    async (request) => {
      const y = request.yetki;
      if (!y) throw new AppError(403, errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
      const { ad, saat_dilimi, logo_url, vurgu_rengi } = request.body;
      const baglam: OlayBaglami = {
        kurumId: y.kurumId,
        actor: { tur: 'kullanici', id: y.kullaniciId },
        correlationId: request.correlationId,
      };
      const satir = await withTenant(
        db,
        { kurumId: y.kurumId, kullaniciId: y.kullaniciId, roller: [y.rol] },
        async (tx) => {
          const [mevcut] = await tx
            .select()
            .from(kurumlar)
            .where(eq(kurumlar.id, y.kurumId))
            .for('update');
          if (!mevcut) throw new AppError(404, errorCodes.notFound, 'Kurum bulunamadı.');
          const eski = kurumAyarlariSema.safeParse(mevcut.ayarlar);
          const ayarlar: Record<string, unknown> = { ...(eski.success ? eski.data : {}) };
          if (logo_url !== undefined) {
            if (logo_url === null) delete ayarlar.logo_url;
            else ayarlar.logo_url = logo_url;
          }
          if (vurgu_rengi !== undefined) {
            if (vurgu_rengi === null) delete ayarlar.vurgu_rengi;
            else ayarlar.vurgu_rengi = vurgu_rengi;
          }
          const [guncel] = await tx
            .update(kurumlar)
            .set({
              ...(ad !== undefined ? { ad } : {}),
              ...(saat_dilimi !== undefined ? { saat_dilimi } : {}),
              ayarlar,
            })
            .where(eq(kurumlar.id, y.kurumId))
            .returning();
          if (!guncel) throw new Error('kurum güncellenemedi');
          if (guncel.ad !== mevcut.ad || guncel.saat_dilimi !== mevcut.saat_dilimi) {
            await olayYaz(tx, hesapKurumDegistiV1, baglam, {
              kurum_id: guncel.id,
              ad: guncel.ad,
              tur: guncel.tur as 'bireysel' | 'ekip' | 'kurum',
              saat_dilimi: guncel.saat_dilimi,
              durum: guncel.durum as 'aktif' | 'askida' | 'kapali',
            });
          }
          return guncel;
        },
      );
      return kurumYaniti(satir);
    },
  );

  // --- Modul ayarlari -------------------------------------------------------------------------

  const ayarYaniti = (s: typeof modulAyarlari.$inferSelect) =>
    ({
      id: s.id,
      modul_kodu: s.modul_kodu,
      kapsam: s.kapsam,
      kapsam_id: s.kapsam_id,
      acik: s.acik,
    }) as z.infer<typeof ModulAyariYazYanitSema>['ayar'] & object;

  app.get(
    '/kurumlar/:kurum_id/modul-ayarlari',
    {
      preHandler: requirePermission('modul.ayar.oku'),
      schema: {
        tags: ['hesap'],
        summary: 'Modul ayarlari (kurum/kademe/grup satirlari)',
        params: kurumParam,
        response: { 200: ModulAyarlariYanitSema },
      },
    },
    async (request) => {
      const y = request.yetki;
      if (!y) throw new AppError(403, errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
      const satirlar = await withTenant(
        db,
        { kurumId: y.kurumId, kullaniciId: y.kullaniciId },
        (tx) =>
          tx
            .select()
            .from(modulAyarlari)
            .where(eq(modulAyarlari.kurum_id, y.kurumId))
            .orderBy(asc(modulAyarlari.id)),
      );
      const kurumEtkin: Record<string, boolean> = {};
      for (const s of satirlar) if (s.kapsam === 'kurum') kurumEtkin[s.modul_kodu] = s.acik;
      return { ayarlar: satirlar.map(ayarYaniti), kurum_etkin: kurumEtkin };
    },
  );

  app.get(
    '/modul-ayarlari/etkin',
    {
      preHandler: requirePermission('modul.ayar.oku'),
      schema: {
        tags: ['hesap'],
        summary: 'Modul bu kademe/grup icin acik mi? (kurum > kademe > grup)',
        querystring: ModulEtkinSorguSema,
        response: { 200: ModulEtkinYanitSema },
      },
    },
    async (request) => {
      const y = request.yetki;
      if (!y) throw new AppError(403, errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
      const q = request.query;
      const acik = await withTenant(db, { kurumId: y.kurumId, kullaniciId: y.kullaniciId }, (tx) =>
        modulAcikMi(tx, y.kurumId, q.modul_kodu, {
          kademeId: q.kademe_id ?? null,
          grupId: q.grup_id ?? null,
        }),
      );
      return { modul_kodu: q.modul_kodu, acik };
    },
  );

  app.put(
    '/kurumlar/:kurum_id/modul-ayarlari',
    {
      preHandler: requirePermission('modul.ayar.yaz', { scope: 'kurum' }),
      schema: {
        tags: ['hesap'],
        summary: 'Modul ayari yaz; acik=null mirasa dondurur. Alt duzey yalnizca daraltabilir.',
        params: kurumParam,
        body: ModulAyariYazGirdiSema,
        response: { 200: ModulAyariYazYanitSema },
      },
    },
    async (request) => {
      const y = request.yetki;
      if (!y) throw new AppError(403, errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
      const g = request.body;
      const kapsamId = g.kapsam === 'kurum' ? y.kurumId : g.kapsam_id;
      if (!kapsamId || (g.kapsam === 'kurum' && g.kapsam_id && g.kapsam_id !== y.kurumId)) {
        throw new AppError(400, errorCodes.validation, 'kapsam_id geçersiz.');
      }
      const baglam: OlayBaglami = {
        kurumId: y.kurumId,
        actor: { tur: 'kullanici', id: y.kullaniciId },
        correlationId: request.correlationId,
      };
      return withTenant(
        db,
        { kurumId: y.kurumId, kullaniciId: y.kullaniciId, roller: [y.rol] },
        async (tx) => {
          // Kapsam kaydi bu kuruma ait olmali (RLS ile gorunur olmayan kayit "yok" sayilir).
          let ustKademeId: string | null = null;
          if (g.kapsam === 'kademe') {
            const [k] = await tx
              .select({ id: kademeler.id })
              .from(kademeler)
              .where(eq(kademeler.id, kapsamId));
            if (!k) throw new AppError(404, errorCodes.notFound, 'Kademe bulunamadı.');
          } else if (g.kapsam === 'grup') {
            const [gr] = await tx
              .select({ id: gruplar.id, kademe_id: gruplar.kademe_id })
              .from(gruplar)
              .where(eq(gruplar.id, kapsamId));
            if (!gr) throw new AppError(404, errorCodes.notFound, 'Grup bulunamadı.');
            ustKademeId = gr.kademe_id;
          }

          const mevcutSorgu = and(
            eq(modulAyarlari.kurum_id, y.kurumId),
            eq(modulAyarlari.modul_kodu, g.modul_kodu),
            eq(modulAyarlari.kapsam, g.kapsam),
            eq(modulAyarlari.kapsam_id, kapsamId),
          );

          if (g.acik === null) {
            const silinen = await tx
              .delete(modulAyarlari)
              .where(mevcutSorgu)
              .returning({ id: modulAyarlari.id });
            const silinenId = silinen[0]?.id;
            if (silinenId) {
              await olayYaz(tx, hesapModulAyariDegistiV1, baglam, {
                modul_ayari_id: silinenId,
                modul_kodu: g.modul_kodu,
                kapsam: g.kapsam,
                kapsam_id: kapsamId,
                acik: null,
              });
            }
            return { ayar: null };
          }

          if (g.acik && g.kapsam !== 'kurum') {
            const ustler: (SQL | undefined)[] = [
              and(eq(modulAyarlari.kapsam, 'kurum'), eq(modulAyarlari.kapsam_id, y.kurumId)),
            ];
            if (g.kapsam === 'grup' && ustKademeId) {
              ustler.push(
                and(eq(modulAyarlari.kapsam, 'kademe'), eq(modulAyarlari.kapsam_id, ustKademeId)),
              );
            }
            const kapali = await tx
              .select({ id: modulAyarlari.id })
              .from(modulAyarlari)
              .where(
                and(
                  eq(modulAyarlari.kurum_id, y.kurumId),
                  eq(modulAyarlari.modul_kodu, g.modul_kodu),
                  eq(modulAyarlari.acik, false),
                  or(...ustler),
                ),
              )
              .limit(1);
            if (kapali.length > 0) {
              throw new AppError(
                422,
                errorCodes.ustDuzeyKapali,
                'Üst düzeyde kapalı olan modül alt düzeyde açılamaz.',
              );
            }
          }

          const [satir] = await tx
            .insert(modulAyarlari)
            .values({
              id: uuidv7(),
              kurum_id: y.kurumId,
              modul_kodu: g.modul_kodu,
              kapsam: g.kapsam,
              kapsam_id: kapsamId,
              acik: g.acik,
              degistiren_id: y.uyelikId,
              created_by: y.kullaniciId,
            })
            .onConflictDoUpdate({
              target: [
                modulAyarlari.kurum_id,
                modulAyarlari.modul_kodu,
                modulAyarlari.kapsam,
                modulAyarlari.kapsam_id,
              ],
              set: { acik: g.acik, degistiren_id: y.uyelikId },
            })
            .returning();
          if (!satir) throw new Error('modül ayarı yazılamadı');
          await olayYaz(tx, hesapModulAyariDegistiV1, baglam, {
            modul_ayari_id: satir.id,
            modul_kodu: g.modul_kodu,
            kapsam: g.kapsam,
            kapsam_id: kapsamId,
            acik: satir.acik,
          });
          return { ayar: ayarYaniti(satir) };
        },
      );
    },
  );

  // --- Uyeler (kapsamli) ----------------------------------------------------------------------

  app.get(
    '/kurumlar/:kurum_id/uyelikler',
    {
      preHandler: requirePermission('uyelik.oku'),
      schema: {
        tags: ['hesap'],
        summary:
          'Uyeleri listele; kapsam rolun izin kapsamina gore daralir (kurum/sube/grup/kendi)',
        params: kurumParam,
        querystring: UyeListeSorguSema,
        response: { 200: UyeListeYanitSema },
      },
    },
    async (request) => {
      const y = request.yetki;
      if (!y) throw new AppError(403, errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
      const { limit, imlec, rol } = request.query;
      return withTenant(
        db,
        { kurumId: y.kurumId, kullaniciId: y.kullaniciId, roller: [y.rol] },
        async (tx) => {
          const kosullar: (SQL | undefined)[] = [eq(uyelikler.kurum_id, y.kurumId)];
          if (rol) kosullar.push(eq(uyelikler.rol, rol));
          if (imlec) kosullar.push(gt(uyelikler.id, imlec));
          switch (y.kapsam) {
            case 'kurum':
              break;
            case 'sube':
              kosullar.push(
                or(eq(uyelikler.sube_id, y.subeId ?? ''), eq(uyelikler.id, y.uyelikId)),
              );
              break;
            case 'grup': {
              const bugun = sql`current_date`;
              const atananGruplar = tx
                .select({ id: atamalar.grup_id })
                .from(atamalar)
                .where(
                  and(
                    eq(atamalar.ogretmen_id, y.uyelikId),
                    or(isNull(atamalar.bitis_tarihi), gt(atamalar.bitis_tarihi, bugun)),
                  ),
                );
              kosullar.push(
                or(
                  eq(uyelikler.id, y.uyelikId),
                  inArray(
                    uyelikler.id,
                    tx
                      .select({ id: grupUyeleri.ogrenci_id })
                      .from(grupUyeleri)
                      .where(
                        and(
                          inArray(grupUyeleri.grup_id, atananGruplar),
                          isNull(grupUyeleri.bitis_tarihi),
                        ),
                      ),
                  ),
                ),
              );
              break;
            }
            case 'kendi':
              kosullar.push(eq(uyelikler.id, y.uyelikId));
              break;
          }
          const satirlar = await tx
            .select({
              uyelik_id: uyelikler.id,
              kullanici_id: uyelikler.kullanici_id,
              rol: uyelikler.rol,
              durum: uyelikler.durum,
              gorunen_ad: sql<
                string | null
              >`coalesce(${uyelikler.gorunen_ad}, ${kullanicilar.gorunen_ad})`,
              sube_id: uyelikler.sube_id,
              kademe_id: uyelikler.kademe_id,
              katildi_at: uyelikler.katildi_at,
            })
            .from(uyelikler)
            .innerJoin(kullanicilar, eq(kullanicilar.id, uyelikler.kullanici_id))
            .where(and(...kosullar))
            .orderBy(asc(uyelikler.id))
            .limit(limit + 1);
          const sayfa = satirlar.slice(0, limit);
          return {
            kapsam: y.kapsam,
            uyeler: sayfa.map((s) => ({
              ...s,
              rol: s.rol as Rol,
              durum: s.durum as 'davetli' | 'aktif' | 'askida' | 'ayrildi',
              katildi_at: s.katildi_at?.toISOString() ?? null,
            })),
            sonraki_imlec: satirlar.length > limit ? (sayfa.at(-1)?.uyelik_id ?? null) : null,
          };
        },
      );
    },
  );
  return Promise.resolve();
};
