import {
  OturumListeYanitSema,
  OturumParamSema,
  OturumSonlandirYanitSema,
  OturumlariKapatGirdiSema,
  OturumlariKapatYanitSema,
  errorCodes,
} from '@kopru/contracts';
import { AppError, type AuthContext, type ServicePlugin } from '@kopru/service-kit';
import { and, desc, eq, gt, isNull, ne } from 'drizzle-orm';

import { oturumlar } from '../../db/schema.js';
import { oturumSonlandirSistem } from '../../sistem/oturum-sonlandir.js';

const CIHAZ_AZAMI = 80;

/** Cihaz bilgisini listede gostermek icin kisaltir (tam user-agent doner degil). */
export function cihazKisalt(adi: string | null, userAgent: string | null): string | null {
  const ham = (adi ?? userAgent)?.trim();
  if (!ham) return null;
  return ham.length > CIHAZ_AZAMI ? `${ham.slice(0, CIHAZ_AZAMI - 1)}…` : ham;
}

/** IP'nin yalniz ilk bolumleri: `192.168.*.*` / `2001:db8:*`. Tam adres asla donmez. */
export function ipMaskele(ip: string | null): string | null {
  if (!ip) return null;
  const adres = ip.replace(/\/\d+$/, '');
  const v4 = /(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(adres);
  if (v4) return `${v4[1] ?? ''}.${v4[2] ?? ''}.*.*`;
  const parcalar = adres.split(':').filter((p) => p.length > 0);
  return parcalar.length > 0 ? `${parcalar.slice(0, 2).join(':')}:*` : null;
}

/**
 * Giris yapmis kullanicinin kendi oturumlari (`/v1/hesap/oturumlar`). Kiracisiz: `hesap.oturumlar`
 * kullaniciya aittir ve RLS'siz tablodur; her sorgu `kullanici_id` ile sinirlanir.
 *
 * Sonlandirma sirasi: sahiplik denetimi -> `sid` iptal listesine yaz (erisim belirteci anindan
 * 401) -> oturum satirini sil (Better Auth satiri silince oturum belirteci de gecersizdir) + denetim
 * kaydi (`api_sistem` ile, tek islemde). Iptal yazilamazsa satir silinmez; istemci yeniden dener.
 */
export const oturumYollari: ServicePlugin = (app) => {
  const { kimlik } = app;
  const { db } = kimlik;

  function aktor(request: { auth: AuthContext | null }): AuthContext {
    if (!request.auth)
      throw new AppError(401, errorCodes.unauthorized, 'Oturum açmanız gerekiyor.');
    if (request.auth.claims.imp !== undefined) {
      throw new AppError(
        403,
        errorCodes.taklitSaltOkunur,
        'Taklit oturumunda değişiklik yapılamaz.',
      );
    }
    return request.auth;
  }

  async function iptalEt(sidler: string[]): Promise<void> {
    await Promise.all(sidler.map((sid) => app.iptal.iptalEt(sid)));
  }

  const etkin = (kullaniciId: string) =>
    and(
      eq(oturumlar.kullanici_id, kullaniciId),
      isNull(oturumlar.iptal_at),
      gt(oturumlar.expires_at, new Date()),
    );

  app.get(
    '/oturumlar',
    {
      schema: {
        tags: ['hesap'],
        summary:
          'Acik oturumlarim (cihazlar). IP tam donmez, `bu_oturum` istegi yapan oturumu isaretler.',
        response: { 200: OturumListeYanitSema },
      },
    },
    async (request) => {
      if (!request.auth)
        throw new AppError(401, errorCodes.unauthorized, 'Oturum açmanız gerekiyor.');
      const { kullaniciId, sessionId } = request.auth;
      const satirlar = await db.orm
        .select()
        .from(oturumlar)
        .where(etkin(kullaniciId))
        .orderBy(desc(oturumlar.son_kullanim_at), desc(oturumlar.id));
      return {
        oturumlar: satirlar.map((o) => ({
          id: o.id,
          created_at: o.created_at.toISOString(),
          son_kullanim_at: o.son_kullanim_at.toISOString(),
          expires_at: o.expires_at.toISOString(),
          cihaz: cihazKisalt(o.cihaz_adi, o.user_agent),
          ip_maskeli: ipMaskele(o.ip),
          bu_oturum: o.id === sessionId,
        })),
      };
    },
  );

  app.post(
    '/oturumlar/tumunu-kapat',
    {
      schema: {
        tags: ['hesap'],
        summary:
          'Tum oturumlarimi sonlandir (mevcut_haric=true ile istegi yapan oturum haric). Sonlanan oturumlarin erisim belirteci aninda 401 olur.',
        body: OturumlariKapatGirdiSema.nullish(),
        response: { 200: OturumlariKapatYanitSema },
      },
    },
    async (request) => {
      const { kullaniciId, sessionId } = aktor(request);
      const haric = (request.body?.mevcut_haric ?? false) && sessionId !== null;
      const satirlar = await db.orm
        .select({ id: oturumlar.id })
        .from(oturumlar)
        .where(and(etkin(kullaniciId), haric ? ne(oturumlar.id, sessionId) : undefined));
      const ids = satirlar.map((s) => s.id);
      await iptalEt(ids);
      const kapatilan = await oturumSonlandirSistem(kimlik.sistemDb, {
        kullaniciId,
        oturumIdleri: ids,
        ayrinti: { kapatilan: ids.length, mevcut_haric: haric },
      });
      return { kapatilan };
    },
  );

  app.delete(
    '/oturumlar/:oturum_id',
    {
      schema: {
        tags: ['hesap'],
        summary:
          'Tek oturumu sonlandir. Baskasinin (veya olmayan) oturumu 404. Erisim belirteci aninda 401 olur.',
        params: OturumParamSema,
        response: { 200: OturumSonlandirYanitSema },
      },
    },
    async (request) => {
      const { kullaniciId } = aktor(request);
      const { oturum_id: id } = request.params;
      const [o] = await db.orm
        .select({ id: oturumlar.id })
        .from(oturumlar)
        .where(and(eq(oturumlar.id, id), eq(oturumlar.kullanici_id, kullaniciId)));
      if (!o) throw new AppError(404, errorCodes.notFound, 'Oturum bulunamadı.');
      await iptalEt([id]);
      await oturumSonlandirSistem(kimlik.sistemDb, {
        kullaniciId,
        oturumIdleri: [id],
        hedefOturumId: id,
      });
      return { sonlandirildi: true as const };
    },
  );

  return Promise.resolve();
};
