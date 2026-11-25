import {
  SILME_SOGUMA_GUN,
  BenGuncelleGirdiSema,
  BenGuncelleYanitSema,
  KULLANICI_DUZEYI_KURUM_ID,
  hesapKullaniciDegistiV1,
  SilmeDurumYanitSema,
  SilmeGeriAlYanitSema,
  SilmeKoduGonderYanitSema,
  SilmeTalebiGirdiSema,
  SilmeTalebiYanitSema,
  VerilerimYanitSema,
  errorCodes,
  type SilmeDogrulama,
} from '@kopru/contracts';
import {
  AppError,
  withTenant,
  withUser,
  type AuthContext,
  type ServicePlugin,
} from '@kopru/service-kit';
import { verifyPassword } from 'better-auth/crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { hesaplar, kullanicilar, otpIstekleri, silmeTalepleri } from '../../db/schema.js';
import { kurumEngelleriniBul, type KurumEngeli } from '../../sistem/kvkk-silme.js';
import { OTP_GECERLILIK_SN } from './better-auth.js';
import { verilerimiTopla } from './kvkk-veri.js';
import { olayYaz } from './olaylar.js';

const muaf = { rizaMuaf: true } as const;
const SAAT_MS = 3_600_000;
const KOD_SAATLIK = 5;

type Talep = typeof silmeTalepleri.$inferSelect;
const talepYaniti = (t: Talep) => ({
  id: t.id,
  durum: t.durum as 'beklemede' | 'geri_alindi' | 'tamamlandi' | 'engellendi',
  talep_at: t.talep_at.toISOString(),
  planlanan_at: t.planlanan_at.toISOString(),
  geri_alindi_at: t.geri_alindi_at?.toISOString() ?? null,
  tamamlandi_at: t.tamamlandi_at?.toISOString() ?? null,
});

/**
 * KVKK hesap silme ve veri disa aktarma (`/v1/hesap/ben/*`; docs/schema/kvkk-silme.md). Hepsi `rizaMuaf`:
 * KVKK metnini henuz onaylamamis kullanici da verisini indirebilir ve hesabini silebilir.
 */
export const kvkkYollari: ServicePlugin = (app) => {
  const { kimlik } = app;
  const { db, auth } = kimlik;

  function aktor(request: { auth: AuthContext | null }, yazma: boolean): AuthContext {
    if (!request.auth)
      throw new AppError(401, errorCodes.unauthorized, 'Oturum açmanız gerekiyor.');
    if (yazma && request.auth.claims.imp !== undefined) {
      throw new AppError(
        403,
        errorCodes.taklitSaltOkunur,
        'Taklit oturumunda değişiklik yapılamaz.',
      );
    }
    return request.auth;
  }

  async function kullaniciBilgisi(kullaniciId: string) {
    const [k] = await db.orm
      .select({ telefon: kullanicilar.telefon_e164, durum: kullanicilar.durum })
      .from(kullanicilar)
      .where(eq(kullanicilar.id, kullaniciId));
    if (!k || k.durum === 'silindi')
      throw new AppError(401, errorCodes.unauthorized, 'Kullanıcı bulunamadı.');
    const [parola] = await db.orm
      .select({ hash: hesaplar.parola_hash })
      .from(hesaplar)
      .where(and(eq(hesaplar.kullanici_id, kullaniciId), eq(hesaplar.saglayici, 'credential')));
    return { telefon: k.telefon, parolaHash: parola?.hash ?? null };
  }

  async function dogrula(kullaniciId: string, d: SilmeDogrulama): Promise<void> {
    const bilgi = await kullaniciBilgisi(kullaniciId);
    const yanlis = () => new AppError(401, errorCodes.kodGecersiz, 'Doğrulama başarısız.');
    if (d.yontem === 'parola') {
      if (
        !bilgi.parolaHash ||
        !(await verifyPassword({ hash: bilgi.parolaHash, password: d.parola }))
      )
        throw yanlis();
      return;
    }
    if (!bilgi.telefon) throw yanlis();
    try {
      // `disableSession`: kod dogrulanir, yeni oturum acilmaz.
      await auth.api.verifyPhoneNumber({
        body: { phoneNumber: bilgi.telefon, code: d.kod, disableSession: true },
      });
    } catch {
      throw yanlis();
    }
  }

  async function aktifTalep(kullaniciId: string): Promise<Talep | null> {
    const [t] = await withUser(db, { kullaniciId }, (tx) =>
      tx
        .select()
        .from(silmeTalepleri)
        .where(
          and(eq(silmeTalepleri.kullanici_id, kullaniciId), eq(silmeTalepleri.durum, 'beklemede')),
        ),
    );
    return t ?? null;
  }

  /** Sahibi oldugu kurumlar icin engeller (kurum baglaminda okunur: RLS). */
  async function engeller(kullaniciId: string): Promise<KurumEngeli[]> {
    const sahipKurumlar = await withUser(db, { kullaniciId }, (tx) =>
      tx.execute<{ kurum_id: string }>(sql`
        select distinct kurum_id from hesap.uyelikler
         where kullanici_id = ${kullaniciId} and rol = 'sahip' and durum = 'aktif'`),
    );
    const sonuc: KurumEngeli[] = [];
    for (const { kurum_id: kurumId } of sahipKurumlar) {
      const e = await withTenant(db, { kurumId, kullaniciId }, (tx) =>
        kurumEngelleriniBul(tx, kullaniciId),
      );
      sonuc.push(...e);
    }
    return sonuc;
  }

  app.patch(
    '/ben',
    {
      config: muaf,
      schema: {
        tags: ['hesap'],
        summary:
          'Görünen adı / dili güncelle (hesap.kullanici.degisti.v1 yayımlar; olayda ad taşınmaz)',
        body: BenGuncelleGirdiSema,
        response: { 200: BenGuncelleYanitSema },
      },
    },
    async (request) => {
      const { kullaniciId } = aktor(request, true);
      return db.orm.transaction(async (tx) => {
        const [onceki] = await tx
          .select()
          .from(kullanicilar)
          .where(eq(kullanicilar.id, kullaniciId))
          .for('update');
        if (!onceki || onceki.durum === 'silindi')
          throw new AppError(401, errorCodes.unauthorized, 'Kullanıcı bulunamadı.');
        const degisen: ('gorunen_ad' | 'dil')[] = [];
        const g = request.body;
        if (g.gorunen_ad !== undefined && g.gorunen_ad !== onceki.gorunen_ad)
          degisen.push('gorunen_ad');
        if (g.dil !== undefined && g.dil !== onceki.dil) degisen.push('dil');
        if (degisen.length === 0) {
          return { gorunen_ad: onceki.gorunen_ad, dil: onceki.dil, degisen_alanlar: degisen };
        }
        const [k] = await tx
          .update(kullanicilar)
          .set({
            ...(degisen.includes('gorunen_ad') ? { gorunen_ad: g.gorunen_ad ?? null } : {}),
            ...(degisen.includes('dil') ? { dil: g.dil ?? onceki.dil } : {}),
          })
          .where(eq(kullanicilar.id, kullaniciId))
          .returning();
        if (!k) throw new AppError(500, errorCodes.internal, 'Güncellenemedi.');
        await olayYaz(
          tx,
          hesapKullaniciDegistiV1,
          {
            kurumId: KULLANICI_DUZEYI_KURUM_ID,
            actor: { tur: 'kullanici', id: kullaniciId },
            correlationId: request.id,
          },
          {
            kullanici_id: kullaniciId,
            dil: k.dil,
            durum: k.durum as 'aktif' | 'askida' | 'silindi',
            degisen_alanlar: degisen,
          },
        );
        return { gorunen_ad: k.gorunen_ad, dil: k.dil, degisen_alanlar: degisen };
      });
    },
  );

  app.get(
    '/ben/silme-talebi',
    {
      config: muaf,
      schema: {
        tags: ['hesap'],
        summary: 'Hesap silme talebi durumu, olası engeller ve kullanılabilir doğrulama yöntemleri',
        response: { 200: SilmeDurumYanitSema },
      },
    },
    async (request) => {
      const { kullaniciId } = aktor(request, false);
      const bilgi = await kullaniciBilgisi(kullaniciId);
      const [son] = await withUser(db, { kullaniciId }, (tx) =>
        tx.execute<{ id: string }>(sql`
          select id from hesap.silme_talepleri where kullanici_id = ${kullaniciId}
           order by (durum = 'beklemede') desc, created_at desc limit 1`),
      );
      let talep: Talep | null = null;
      if (son) {
        [talep = null] = await withUser(db, { kullaniciId }, (tx) =>
          tx.select().from(silmeTalepleri).where(eq(silmeTalepleri.id, son.id)),
        );
      }
      return {
        talep: talep ? talepYaniti(talep) : null,
        soguma_gun: SILME_SOGUMA_GUN,
        engeller: await engeller(kullaniciId),
        dogrulama_yontemleri: [
          ...(bilgi.telefon ? (['otp'] as const) : []),
          ...(bilgi.parolaHash ? (['parola'] as const) : []),
        ],
      };
    },
  );

  app.post(
    '/ben/silme-talebi/kod-gonder',
    {
      config: muaf,
      schema: {
        tags: ['hesap'],
        summary: 'Hesap silme için kendi telefonuna doğrulama kodu (OTP) gönder',
        response: { 200: SilmeKoduGonderYanitSema },
      },
    },
    async (request) => {
      const { kullaniciId } = aktor(request, true);
      const { telefon } = await kullaniciBilgisi(kullaniciId);
      if (!telefon)
        throw new AppError(
          409,
          errorCodes.conflict,
          'Hesapta doğrulanmış telefon yok; parola kullanın.',
        );
      const sinir = new Date(Date.now() - SAAT_MS);
      const [s] = await db.orm
        .select({ n: sql<string>`count(*)` })
        .from(otpIstekleri)
        .where(and(eq(otpIstekleri.tanimlayici, telefon), gt(otpIstekleri.created_at, sinir)));
      if (Number(s?.n ?? 0) >= KOD_SAATLIK)
        throw new AppError(
          429,
          errorCodes.rateLimited,
          'Çok fazla kod istediniz. Bir saat sonra tekrar deneyin.',
        );
      await db.orm
        .insert(otpIstekleri)
        .values({ id: uuidv7(), tanimlayici: telefon, ip: request.ip });
      await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: telefon } });
      return { gonderildi: true as const, gecerlilik_sn: OTP_GECERLILIK_SN };
    },
  );

  app.post(
    '/ben/silme-talebi',
    {
      config: { ...muaf, rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['hesap'],
        summary: `Hesap silme talebi (yeniden doğrulama: OTP ya da parola). ${String(SILME_SOGUMA_GUN)} gün içinde geri alınabilir, sonra kalıcı anonimleştirme.`,
        body: SilmeTalebiGirdiSema,
        response: { 201: SilmeTalebiYanitSema },
      },
    },
    async (request, reply) => {
      const { kullaniciId } = aktor(request, true);
      await dogrula(kullaniciId, request.body.dogrulama);
      const engel = await engeller(kullaniciId);
      if (engel.length > 0) {
        throw new AppError(
          409,
          errorCodes.kurumSahibiEngeli,
          'Kurumun tek sahibisiniz ve kurumda başka üyeler var. Önce başka bir sahip atayın ya da kurumun kapatılması için destekle iletişime geçin.',
          { kurumlar: engel },
        );
      }
      if (await aktifTalep(kullaniciId))
        throw new AppError(
          409,
          errorCodes.silmeTalebiVar,
          'Zaten bekleyen bir silme talebiniz var.',
        );
      const simdi = new Date();
      const planlanan = new Date(simdi.getTime() + SILME_SOGUMA_GUN * 86_400_000);
      const [t] = await withUser(db, { kullaniciId }, (tx) =>
        tx
          .insert(silmeTalepleri)
          .values({
            id: uuidv7(),
            kullanici_id: kullaniciId,
            talep_at: simdi,
            planlanan_at: planlanan,
            dogrulama_yontemi: request.body.dogrulama.yontem,
            kaynak: request.body.kaynak,
          })
          .returning(),
      );
      if (!t) throw new AppError(500, errorCodes.internal, 'Talep kaydedilemedi.');
      return reply.status(201).send({ talep: talepYaniti(t) });
    },
  );

  app.delete(
    '/ben/silme-talebi',
    {
      config: muaf,
      schema: {
        tags: ['hesap'],
        summary: 'Bekleyen hesap silme talebini geri al (soğuma süresi içinde)',
        response: { 200: SilmeGeriAlYanitSema },
      },
    },
    async (request) => {
      const { kullaniciId } = aktor(request, true);
      const [t] = await withUser(db, { kullaniciId }, (tx) =>
        tx
          .update(silmeTalepleri)
          .set({ durum: 'geri_alindi', geri_alindi_at: new Date() })
          .where(
            and(
              eq(silmeTalepleri.kullanici_id, kullaniciId),
              eq(silmeTalepleri.durum, 'beklemede'),
            ),
          )
          .returning(),
      );
      if (!t) throw new AppError(404, errorCodes.notFound, 'Bekleyen silme talebi yok.');
      return { talep: talepYaniti(t) };
    },
  );

  app.get(
    '/ben/verilerim',
    {
      config: { ...muaf, rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        tags: ['hesap'],
        summary:
          'Kişisel verilerimi indir (KVKK m.11): hesap, üyelik, kendi içeriklerim ve diğer servislerin verisi (JSON)',
        response: { 200: VerilerimYanitSema },
      },
    },
    async (request, reply) => {
      // Toplu kişisel veri dışa aktarımı yalnız kullanıcının kendisine: taklit oturumu (destek) indiremez.
      const { kullaniciId } = aktor(request, true);
      void reply.header('content-disposition', 'attachment; filename="verilerim.json"');
      void reply.header('cache-control', 'no-store');
      return verilerimiTopla(app, kullaniciId);
    },
  );

  return Promise.resolve();
};
