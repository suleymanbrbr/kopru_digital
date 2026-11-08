import { createHash, randomBytes } from 'node:crypto';

import {
  DavetKabulGirdiSema,
  DavetKabulYanitSema,
  DavetListeSorguSema,
  DavetListeYanitSema,
  DavetOlusturGirdiSema,
  DavetOlusturYanitSema,
  DavetSema,
  errorCodes,
  hesapDavetKabulEdildiV1,
  hesapHataKodlari,
  hesapUyelikDegistiV1,
  izinVarMi,
  type DavetTipi,
  type Rol,
} from '@kopru/contracts';
import { AppError, withTenant, type ServicePlugin, type Tx } from '@kopru/service-kit';
import { and, asc, eq, gt, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import {
  davetler,
  gruplar,
  kademeler,
  kullanicilar,
  kurumlar,
  subeler,
  uyelikler,
} from '../../db/schema.js';
import { LogEpostaGonderici, type EpostaGonderici } from './eposta.js';
import { birebirGrupOlustur, grubaOgrenciEkle } from './grup-deposu.js';
import { atananGruplar } from './kapsam.js';
import type { YetkiBaglami } from './kimlik.js';
import { olayYaz, type OlayBaglami } from './olaylar.js';
import { telefonuNormallestir } from './telefon.js';
import { requirePermission } from './yetki.js';

const kurumParam = z.object({ kurum_id: z.uuid() });
const davetParam = kurumParam.extend({ davet_id: z.uuid() });
const GUN_MS = 86_400_000;
const AZAMI_GONDERIM = 3;

type DavetSatiri = typeof davetler.$inferSelect;

const hashle = (belirtec: string) => createHash('sha256').update(belirtec).digest();
const yeniBelirtec = () => randomBytes(32).toString('base64url');

/** Okuma anindaki etkin durum: suresi gecmis `bekliyor` kaydi `suresi_doldu` sayilir. */
const etkinDurum = sql<
  DavetTipi['durum']
>`case when ${davetler.durum} = 'bekliyor' and ${davetler.expires_at} <= now() then 'suresi_doldu' else ${davetler.durum} end`;

function davetYaniti(d: DavetSatiri, durum: DavetTipi['durum']): DavetTipi {
  return {
    id: d.id,
    kanal: d.kanal as DavetTipi['kanal'],
    rol: d.rol as DavetTipi['rol'],
    durum,
    hedef_telefon_e164: d.hedef_telefon_e164,
    hedef_eposta: d.hedef_eposta,
    hedef_ad: d.hedef_ad,
    grup_id: d.grup_id,
    kademe_id: d.kademe_id,
    sube_id: d.sube_id,
    davet_eden_id: d.davet_eden_id,
    max_kullanim: d.max_kullanim,
    kullanim_sayisi: d.kullanim_sayisi,
    gonderim_sayisi: d.sms_gonderim_sayisi,
    son_gonderim_at: d.son_sms_at?.toISOString() ?? null,
    expires_at: d.expires_at.toISOString(),
    created_at: d.created_at.toISOString(),
  };
}

const yeniKayitDurumu = (d: DavetSatiri): DavetTipi['durum'] =>
  d.durum === 'bekliyor' && d.expires_at.getTime() <= Date.now()
    ? 'suresi_doldu'
    : (d.durum as DavetTipi['durum']);

function yetkiAl(request: { yetki: YetkiBaglami | null }): YetkiBaglami {
  if (!request.yetki) throw new AppError(403, errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
  return request.yetki;
}

const kiraci = (y: YetkiBaglami) => ({
  kurumId: y.kurumId,
  kullaniciId: y.kullaniciId,
  roller: [y.rol],
});

/** Davet kapsam kosulu: sube -> ayni sube, grup (ogretmen) -> atandigi gruplara bagli davetler. */
function davetKapsami(tx: Tx, y: YetkiBaglami): SQL | undefined {
  switch (y.kapsam) {
    case 'kurum':
      return undefined;
    case 'sube':
      return eq(davetler.sube_id, y.subeId ?? '00000000-0000-0000-0000-000000000000');
    case 'grup':
      return inArray(davetler.grup_id, atananGruplar(tx, y.uyelikId));
    case 'kendi':
      return eq(davetler.davet_eden_id, y.uyelikId);
  }
}

const davetBulunamadi = () => new AppError(404, errorCodes.notFound, 'Davet bulunamadı.');
const davetGecersiz = () =>
  new AppError(
    410,
    hesapHataKodlari.davetGecersiz,
    'Davet geçersiz, kullanılmış ya da süresi dolmuş.',
  );

/** Davet uc noktalari: `/v1/hesap/kurumlar/:kurum_id/davetler` ve kabul `/v1/hesap/davetler/kabul`. */
export const davetYollari = (eposta?: EpostaGonderici): ServicePlugin =>
  function davetYollariPlugin(app) {
    const { kimlik } = app;
    const { db } = kimlik;
    const epostaGonderici = eposta ?? new LogEpostaGonderici(app.log);

    /** Gonderim kurum disi bir cagridir; hata isi bozmaz, yalnizca davet_id loglanir (PII yok). */
    async function gonder(
      d: DavetSatiri,
      belirtec: string,
    ): Promise<'gonderildi' | 'basarisiz' | 'yok'> {
      const baglanti = `${kimlik.env.PUBLIC_URL}/davet/${belirtec}`;
      const metin = `Köprü daveti: ${baglanti}`;
      try {
        if (d.kanal === 'sms' && d.hedef_telefon_e164) {
          await kimlik.sms.gonder({ telefon: d.hedef_telefon_e164, metin });
          return 'gonderildi';
        }
        if (d.kanal === 'eposta' && d.hedef_eposta) {
          await epostaGonderici.gonder({
            alici: d.hedef_eposta,
            konu: 'Köprü daveti',
            metin,
            baglamId: d.id,
          });
          return 'gonderildi';
        }
        return 'yok';
      } catch (err) {
        app.log.error(
          { davet_id: d.id, hata: err instanceof Error ? err.name : 'bilinmiyor' },
          'davet gönderilemedi',
        );
        return 'basarisiz';
      }
    }

    // --- Olusturma -----------------------------------------------------------------------

    app.post(
      '/kurumlar/:kurum_id/davetler',
      {
        preHandler: requirePermission('davet.yaz', { scope: 'grup' }),
        schema: {
          tags: ['hesap'],
          summary:
            'Davet olustur (sms | eposta | baglanti). Duz belirtec yalniz bu yanitta doner. Ogretmen yalniz atandigi gruba ogrenci davet eder.',
          params: kurumParam,
          body: DavetOlusturGirdiSema,
          response: { 201: DavetOlusturYanitSema },
        },
      },
      async (request, reply) => {
        const y = yetkiAl(request);
        const g = request.body;
        if (g.rol === 'yonetici' && !izinVarMi(y.rol, 'rol.yonet')) {
          throw new AppError(403, errorCodes.izinYok, 'Yönetici davet etme yetkiniz yok.');
        }
        if (y.kapsam === 'grup' && (g.rol !== 'ogrenci' || !g.grup_id)) {
          throw new AppError(
            403,
            errorCodes.izinYok,
            'Yalnızca atandığınız gruba öğrenci davet edebilirsiniz.',
          );
        }
        let telefon: string | null = null;
        if (g.kanal === 'sms') {
          telefon = telefonuNormallestir(g.telefon ?? '');
          if (!telefon) {
            throw new AppError(400, errorCodes.gecersizTelefon, 'Telefon numarası geçersiz.');
          }
        }
        let subeId = g.sube_id ?? null;
        if (y.kapsam === 'sube') {
          if (subeId && subeId !== y.subeId) {
            throw new AppError(403, errorCodes.izinYok, 'Bu şubede davet oluşturma yetkiniz yok.');
          }
          subeId = y.subeId;
        }
        const belirtec = yeniBelirtec();
        const gonderimli = g.kanal !== 'baglanti';

        const satir = await withTenant(db, kiraci(y), async (tx) => {
          if (g.grup_id) {
            const [grup] = await tx
              .select({ id: gruplar.id, durum: gruplar.durum })
              .from(gruplar)
              .where(
                and(
                  eq(gruplar.id, g.grup_id),
                  y.kapsam === 'grup'
                    ? inArray(gruplar.id, atananGruplar(tx, y.uyelikId))
                    : undefined,
                  y.kapsam === 'sube' ? eq(gruplar.sube_id, y.subeId ?? '') : undefined,
                ),
              );
            if (!grup) throw new AppError(404, errorCodes.notFound, 'Grup bulunamadı.');
            if (grup.durum !== 'aktif') {
              throw new AppError(
                409,
                hesapHataKodlari.grupArsivde,
                'Arşivlenmiş gruba davet edilemez.',
              );
            }
          }
          if (g.kademe_id) {
            const [k] = await tx
              .select({ id: kademeler.id })
              .from(kademeler)
              .where(eq(kademeler.id, g.kademe_id));
            if (!k) throw new AppError(404, errorCodes.notFound, 'Kademe bulunamadı.');
          }
          if (subeId) {
            const [s] = await tx
              .select({ id: subeler.id })
              .from(subeler)
              .where(eq(subeler.id, subeId));
            if (!s) throw new AppError(404, errorCodes.notFound, 'Şube bulunamadı.');
          }
          const [d] = await tx
            .insert(davetler)
            .values({
              id: uuidv7(),
              kurum_id: y.kurumId,
              kanal: g.kanal,
              rol: g.rol,
              belirtec_hash: hashle(belirtec),
              hedef_telefon_e164: telefon,
              hedef_eposta: g.kanal === 'eposta' ? (g.eposta ?? null) : null,
              hedef_ad: g.hedef_ad ?? null,
              grup_id: g.grup_id ?? null,
              kademe_id: g.kademe_id ?? null,
              sube_id: subeId,
              davet_eden_id: y.uyelikId,
              max_kullanim: g.max_kullanim,
              expires_at: new Date(Date.now() + g.gecerlilik_gun * GUN_MS),
              sms_gonderim_sayisi: gonderimli ? 1 : 0,
              son_sms_at: gonderimli ? new Date() : null,
              created_by: y.kullaniciId,
            })
            .returning();
          if (!d) throw new Error('davet oluşturulamadı');
          return d;
        });

        const gonderim = await gonder(satir, belirtec);
        return reply
          .status(201)
          .send({ davet: davetYaniti(satir, yeniKayitDurumu(satir)), belirtec, gonderim });
      },
    );

    // --- Listeleme -----------------------------------------------------------------------

    app.get(
      '/kurumlar/:kurum_id/davetler',
      {
        preHandler: requirePermission('davet.yaz', { scope: 'grup' }),
        schema: {
          tags: ['hesap'],
          summary:
            'Davetleri listele (durum suzgeci, sayfali). Suresi gecen bekleyen davet okuma aninda suresi_doldu gorunur.',
          params: kurumParam,
          querystring: DavetListeSorguSema,
          response: { 200: DavetListeYanitSema },
        },
      },
      async (request) => {
        const y = yetkiAl(request);
        const { durum, grup_id, limit, imlec } = request.query;
        return withTenant(db, kiraci(y), async (tx) => {
          const kosullar: (SQL | undefined)[] = [
            eq(davetler.kurum_id, y.kurumId),
            davetKapsami(tx, y),
          ];
          if (durum === 'bekliyor') {
            kosullar.push(eq(davetler.durum, 'bekliyor'), gt(davetler.expires_at, sql`now()`));
          } else if (durum === 'suresi_doldu') {
            kosullar.push(
              or(
                eq(davetler.durum, 'suresi_doldu'),
                and(eq(davetler.durum, 'bekliyor'), lte(davetler.expires_at, sql`now()`)),
              ),
            );
          } else if (durum) {
            kosullar.push(eq(davetler.durum, durum));
          }
          if (grup_id) kosullar.push(eq(davetler.grup_id, grup_id));
          if (imlec) kosullar.push(gt(davetler.id, imlec));
          const satirlar = await tx
            .select({ d: davetler, durum_etkin: etkinDurum })
            .from(davetler)
            .where(and(...kosullar))
            .orderBy(asc(davetler.id))
            .limit(limit + 1);
          const sayfa = satirlar.slice(0, limit);
          return {
            kapsam: y.kapsam,
            davetler: sayfa.map((s) => davetYaniti(s.d, s.durum_etkin)),
            sonraki_imlec: satirlar.length > limit ? (sayfa.at(-1)?.d.id ?? null) : null,
          };
        });
      },
    );

    // --- Iptal ---------------------------------------------------------------------------

    app.post(
      '/kurumlar/:kurum_id/davetler/:davet_id/iptal',
      {
        preHandler: requirePermission('davet.yaz', { scope: 'grup' }),
        schema: {
          tags: ['hesap'],
          summary:
            'Bekleyen daveti iptal et; tekrar cagri etkisizdir, kullanilmis davet iptal edilemez (409)',
          params: davetParam,
          response: { 200: DavetSema },
        },
      },
      async (request) => {
        const y = yetkiAl(request);
        return withTenant(db, kiraci(y), async (tx) => {
          const [d] = await tx
            .select()
            .from(davetler)
            .where(and(eq(davetler.id, request.params.davet_id), davetKapsami(tx, y)))
            .for('update');
          if (!d) throw davetBulunamadi();
          if (d.durum === 'iptal') return davetYaniti(d, 'iptal');
          if (d.durum !== 'bekliyor') {
            throw new AppError(409, hesapHataKodlari.davetBeklemiyor, 'Davet artık beklemiyor.');
          }
          const [g] = await tx
            .update(davetler)
            .set({ durum: 'iptal' })
            .where(eq(davetler.id, d.id))
            .returning();
          if (!g) throw davetBulunamadi();
          return davetYaniti(g, 'iptal');
        });
      },
    );

    // --- Yeniden gonderme ----------------------------------------------------------------

    app.post(
      '/kurumlar/:kurum_id/davetler/:davet_id/yeniden-gonder',
      {
        preHandler: requirePermission('davet.yaz', { scope: 'grup' }),
        schema: {
          tags: ['hesap'],
          summary:
            'SMS / e-posta davetini yeniden gonder (en cok 3 gonderim). Duz belirtec saklanmadigi icin yeni belirtec uretilir, eski baglanti gecersizlesir ve sure 7 gun uzar.',
          params: davetParam,
          response: { 200: DavetOlusturYanitSema },
        },
      },
      async (request) => {
        const y = yetkiAl(request);
        const belirtec = yeniBelirtec();
        const satir = await withTenant(db, kiraci(y), async (tx) => {
          const [d] = await tx
            .select()
            .from(davetler)
            .where(and(eq(davetler.id, request.params.davet_id), davetKapsami(tx, y)))
            .for('update');
          if (!d) throw davetBulunamadi();
          if (d.durum !== 'bekliyor') {
            throw new AppError(409, hesapHataKodlari.davetBeklemiyor, 'Davet artık beklemiyor.');
          }
          if (d.kanal === 'baglanti') {
            throw new AppError(
              422,
              hesapHataKodlari.yenidenGonderilemez,
              'Bağlantı davetleri yeniden gönderilemez; bağlantıyı paylaşın.',
            );
          }
          if (d.sms_gonderim_sayisi >= AZAMI_GONDERIM) {
            throw new AppError(
              429,
              hesapHataKodlari.gonderimSiniriAsildi,
              'Bu davet için en fazla 3 gönderim yapılabilir.',
            );
          }
          const [g] = await tx
            .update(davetler)
            .set({
              belirtec_hash: hashle(belirtec),
              sms_gonderim_sayisi: sql`${davetler.sms_gonderim_sayisi} + 1`,
              son_sms_at: sql`now()`,
              expires_at: sql`now() + interval '7 days'`,
            })
            .where(eq(davetler.id, d.id))
            .returning();
          if (!g) throw davetBulunamadi();
          return g;
        });
        const gonderim = await gonder(satir, belirtec);
        return { davet: davetYaniti(satir, 'bekliyor'), belirtec, gonderim };
      },
    );

    // --- Kabul ---------------------------------------------------------------------------

    app.post(
      '/davetler/kabul',
      {
        schema: {
          tags: ['hesap'],
          summary:
            'Daveti kabul et (giris yapmis kullanici): uyelik olusur, davette grup varsa gruba eklenir. Gecersiz/kullanilmis/suresi dolmus: 410 davet_gecersiz.',
          body: DavetKabulGirdiSema,
          response: { 200: DavetKabulYanitSema },
        },
      },
      async (request) => {
        const auth = request.auth;
        if (!auth) throw new AppError(401, errorCodes.unauthorized, 'Oturum açmanız gerekiyor.');
        if (auth.claims.imp !== undefined) {
          throw new AppError(
            403,
            errorCodes.taklitSaltOkunur,
            'Taklit oturumunda değişiklik yapılamaz.',
          );
        }
        const kullaniciId = auth.kullaniciId;
        const hash = hashle(request.body.belirtec);

        // Giris oncesi kiraci bulma: dar kapsamli SECURITY DEFINER fonksiyonu (ADR 0003 madde 6).
        const cozum = await db.orm.execute<{
          kurum_id: string;
          davet_id: string;
          durum: string;
          expires_at: Date;
        }>(sql`select * from hesap.davet_coz(${hash})`);
        const c = cozum[0];
        if (c?.durum !== 'bekliyor' || new Date(c.expires_at).getTime() <= Date.now()) {
          throw davetGecersiz();
        }

        const baglam: OlayBaglami = {
          kurumId: c.kurum_id,
          actor: { tur: 'kullanici', id: kullaniciId },
          correlationId: request.correlationId,
        };

        return withTenant(db, { kurumId: c.kurum_id, kullaniciId, roller: [] }, async (tx) => {
          // Atomik tuketim: yaris durumunda ikinci kabul 0 satir alir.
          const [d] = await tx
            .update(davetler)
            .set({
              kullanim_sayisi: sql`${davetler.kullanim_sayisi} + 1`,
              durum: sql`case when ${davetler.kullanim_sayisi} + 1 >= ${davetler.max_kullanim} then 'kullanildi' else ${davetler.durum} end`,
              kabul_eden_kullanici_id: kullaniciId,
            })
            .where(
              and(
                eq(davetler.id, c.davet_id),
                eq(davetler.belirtec_hash, hash),
                eq(davetler.durum, 'bekliyor'),
                gt(davetler.expires_at, sql`now()`),
                sql`${davetler.kullanim_sayisi} < ${davetler.max_kullanim}`,
              ),
            )
            .returning();
          if (!d) throw davetGecersiz();
          const rol = d.rol as Rol;

          const [kullanici] = await tx
            .select({ gorunen_ad: kullanicilar.gorunen_ad })
            .from(kullanicilar)
            .where(eq(kullanicilar.id, kullaniciId));
          const gorunenAd = d.hedef_ad ?? kullanici?.gorunen_ad ?? null;

          const [mevcut] = await tx
            .select()
            .from(uyelikler)
            .where(
              and(
                eq(uyelikler.kurum_id, c.kurum_id),
                eq(uyelikler.kullanici_id, kullaniciId),
                eq(uyelikler.rol, rol),
              ),
            );

          let uyelikId: string;
          let yeniUyelik = false;
          if (!mevcut) {
            uyelikId = uuidv7();
            yeniUyelik = true;
            await tx.insert(uyelikler).values({
              id: uyelikId,
              kurum_id: c.kurum_id,
              kullanici_id: kullaniciId,
              rol,
              durum: 'aktif',
              sube_id: d.sube_id,
              kademe_id: rol === 'ogrenci' ? d.kademe_id : null,
              gorunen_ad: gorunenAd,
              katildi_at: new Date(),
              created_by: kullaniciId,
            });
          } else if (mevcut.durum === 'aktif') {
            uyelikId = mevcut.id;
            if (!d.grup_id) {
              throw new AppError(
                409,
                hesapHataKodlari.zatenUye,
                'Bu kurumda zaten bu role sahipsiniz.',
              );
            }
          } else if (mevcut.durum === 'ayrildi') {
            uyelikId = mevcut.id;
            yeniUyelik = true;
            await tx
              .update(uyelikler)
              .set({ durum: 'aktif', ayrildi_at: null, katildi_at: new Date() })
              .where(eq(uyelikler.id, mevcut.id));
          } else {
            throw new AppError(
              409,
              hesapHataKodlari.uyelikAskida,
              'Üyeliğiniz askıda; kurumla iletişime geçin.',
            );
          }

          if (yeniUyelik) {
            await olayYaz(tx, hesapUyelikDegistiV1, baglam, {
              uyelik_id: uyelikId,
              kullanici_id: kullaniciId,
              rol,
              durum: 'aktif',
              sube_id: mevcut?.sube_id ?? d.sube_id,
              kademe_id: mevcut?.kademe_id ?? (rol === 'ogrenci' ? d.kademe_id : null),
              gorunen_ad: mevcut?.gorunen_ad ?? gorunenAd,
            });
          }

          let grupUyesiId: string | null = null;
          if (rol === 'ogrenci') {
            if (d.grup_id) {
              const r = await grubaOgrenciEkle(tx, {
                kurumId: c.kurum_id,
                grupId: d.grup_id,
                ogrenciIdleri: [uyelikId],
                katilimYolu: 'davet',
                kullaniciId,
                baglam,
              });
              grupUyesiId = r.eklenenler[0]?.id ?? null;
            } else {
              // Solo hoca akisi: bireysel kurumda grupsuz ogrenci icin birebir grup otomatik acilir.
              const [kurum] = await tx
                .select({ tur: kurumlar.tur })
                .from(kurumlar)
                .where(eq(kurumlar.id, c.kurum_id));
              if (kurum?.tur === 'bireysel') {
                const b = await birebirGrupOlustur(tx, {
                  kurumId: c.kurum_id,
                  ogrenciId: uyelikId,
                  kullaniciId,
                  baglam,
                });
                if (b) {
                  grupUyesiId = b.grupUyesiId;
                  d.grup_id = b.grupId;
                }
              }
            }
          }

          await olayYaz(tx, hesapDavetKabulEdildiV1, baglam, {
            davet_id: d.id,
            davet_eden_id: d.davet_eden_id,
            uyelik_id: uyelikId,
            rol,
          });
          return {
            davet_id: d.id,
            kurum_id: c.kurum_id,
            uyelik_id: uyelikId,
            rol,
            grup_id: d.grup_id,
            grup_uyesi_id: grupUyesiId,
          };
        });
      },
    );

    return Promise.resolve();
  };
