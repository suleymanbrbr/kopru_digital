import {
  errorCodes,
  izinKapsami,
  izinModulu,
  kapsamYeterli,
  RolSema,
  type IzinKodu,
  type Kapsam,
} from '@kopru/contracts';
import { AppError, withTenant } from '@kopru/service-kit';
import { and, eq } from 'drizzle-orm';
import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';

import { kurumlar, uyelikler } from '../../db/schema.js';
import { abonelikGerekli, yazmaKilitliMi } from '../abonelik/index.js';
import type { YetkiBaglami } from './kimlik.js';
import { modulAcikMi, type ModulBaglami } from './modul-ayarlari.js';

export interface IzinSecenekleri {
  /** Rolun izin kapsami en az bu kadar genis olmali (varsayilan: `kendi`). */
  scope?: Kapsam;
  /** Modul kontrolu icin istek baglamindan kademe/grup cikarir. */
  modulBaglami?: (request: FastifyRequest) => ModulBaglami;
}

const YAZMA_OLMAYAN = new Set(['GET', 'HEAD', 'OPTIONS']);

const yasak = (kod: string, mesaj: string) => new AppError(403, kod, mesaj);

/**
 * Kiraci rotalari icin yetki kapisi. ADR 0004 kontrol sirasi: kimlik (service-kit) ve riza (kimlik
 * plugin'i) bu middleware'den once calisir; burada sirayla kiraci -> taklit -> modul -> izin -> kapsam.
 * Basarili olursa `request.yetki` doldurulur (etkin kapsam uyelik `sube_id` ile daraltilir).
 * Platform askisi: askidaki kurumun kullanicilari 403 `kurum_askida` alir (taklit okumasi haric).
 * Abonelik durumu (adim 4): `askida`/`sona_erdi` kurumda yazma istekleri `402 abonelik_gerekli`; okuma ve
 * `abonelik.*` izinli uc noktalar (sahibin plan ekrani, yeni abonelik) acik kalir.
 */
export function requirePermission(
  izin: IzinKodu,
  options: IzinSecenekleri = {},
): preHandlerAsyncHookHandler {
  return async function izinKapisi(request) {
    const auth = request.auth;
    if (!auth) throw new AppError(401, errorCodes.unauthorized, 'Oturum açmanız gerekiyor.');

    // 3. Kiraci
    if (!auth.kurumId || !auth.uyelikId) {
      throw yasak(errorCodes.kurumGerekli, 'Önce bir kurum seçmelisiniz.');
    }
    const urlKurum = (request.params as { kurum_id?: unknown } | undefined)?.kurum_id;
    if (typeof urlKurum === 'string' && urlKurum !== auth.kurumId) {
      throw yasak(errorCodes.forbidden, 'Bu kuruma erişim yetkiniz yok.');
    }

    // 8. Taklit: yazma her zaman reddedilir.
    if (auth.claims.imp !== undefined && !YAZMA_OLMAYAN.has(request.method)) {
      throw yasak(errorCodes.taklitSaltOkunur, 'Taklit oturumunda değişiklik yapılamaz.');
    }

    const { db } = request.server;
    if (!db) throw new AppError(503, errorCodes.unavailable, 'Veritabanı kullanılamıyor.');
    const kullaniciId = auth.kullaniciId;
    const kurumId = auth.kurumId;
    const uyelikId = auth.uyelikId;

    // 5. Modul (izinden once: kapali modul izin ayrintisini sizdirmaz)
    const modul = izinModulu(izin);
    const rol = RolSema.safeParse(auth.rol);
    const baglam = options.modulBaglami?.(request) ?? {};
    // 4. Abonelik durumu: yalniz yazma istekleri ve abonelik disi izinler icin sorgulanir.
    const yazmaKapisiGerekli = !YAZMA_OLMAYAN.has(request.method) && !izin.startsWith('abonelik.');
    const { uye, acik, kilitli, platformAskida } = await withTenant(
      db,
      { kurumId, kullaniciId, roller: auth.roller },
      async (tx) => {
        const kilitliMi = yazmaKapisiGerekli ? await yazmaKilitliMi(tx, kurumId) : false;
        const acikMi = modul ? await modulAcikMi(tx, kurumId, modul, baglam) : true;
        const [satir] = await tx
          .select({ rol: uyelikler.rol, durum: uyelikler.durum, sube_id: uyelikler.sube_id })
          .from(uyelikler)
          .where(and(eq(uyelikler.id, uyelikId), eq(uyelikler.kullanici_id, kullaniciId)));
        // Platform askisi (0018): kurumu platform yoneticisi elle askiya almis (abonelik askisindan ayri).
        const [kurum] = await tx
          .select({ askida: kurumlar.platform_askida_at })
          .from(kurumlar)
          .where(eq(kurumlar.id, kurumId));
        return {
          uye: satir,
          acik: acikMi,
          kilitli: kilitliMi,
          platformAskida: kurum?.askida != null,
        };
      },
    );
    // Taklit okumasi (destek) platform askisindaki kurumu da gorebilir; kurum kullanicilari goremez.
    if (platformAskida && auth.claims.imp === undefined) {
      throw yasak(
        errorCodes.kurumAskida,
        'Kurumunuzun hesabı askıya alındı. Destek ekibiyle iletişime geçin.',
      );
    }
    if (kilitli) throw abonelikGerekli();
    if (!acik) throw yasak(errorCodes.modulKapali, 'Bu özellik kurumunuzda kapalı.');

    // 6. Izin. Uyelik hala etkin ve belirtecteki rolle ayni olmali (belirtec omru icindeki degisiklikler).
    if (!rol.success || uye?.durum !== 'aktif' || uye.rol !== rol.data) {
      throw yasak(errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
    }
    const verilen = izinKapsami(rol.data, izin);
    if (verilen === null) throw yasak(errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');

    // 7. Kapsam: sube bagli yonetici/ogretmen en cok `sube` kapsaminda.
    const kapsam: Kapsam = verilen === 'kurum' && uye.sube_id !== null ? 'sube' : verilen;
    if (!kapsamYeterli(kapsam, options.scope ?? 'kendi')) {
      throw yasak(errorCodes.izinYok, 'Bu işlem için yetkiniz yok.');
    }
    const yetki: YetkiBaglami = {
      kullaniciId,
      kurumId,
      uyelikId,
      rol: rol.data,
      subeId: uye.sube_id,
      kapsam,
    };
    request.yetki = yetki;
  };
}
