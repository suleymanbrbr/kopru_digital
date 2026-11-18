import { errorCodes, type PlatformRolu } from '@kopru/contracts';
import { AppError, type Database } from '@kopru/service-kit';
import type { FastifyRequest } from 'fastify';

import type { SistemBaglami } from '../../../sistem/platform-ortak.js';
import type { KimlikHizmeti } from '../kimlik.js';

/** Bir platform isteginin denetim durumu: istek boyunca doldurulur, `onSend`te (veya islemle birlikte) yazilir. */
export interface PlatformDenetimDurumu {
  eylem: string;
  kurumId?: string | undefined;
  hedefTuru?: string | undefined;
  hedefId?: string | undefined;
  /** Kisisel veri YOK: yalniz sayim/tur/filtre adi gibi alanlar. */
  ayrinti?: Record<string, unknown> | undefined;
  /** Veri degisikligiyle ayni islemde yazildiysa true (`onSend` ikinci satir yazmaz). */
  yazildi: boolean;
}

export interface PlatformKimligi {
  kullaniciId: string;
  rol: PlatformRolu;
}

declare module 'fastify' {
  interface FastifyRequest {
    platformDenetim: PlatformDenetimDurumu | null;
    platform: PlatformKimligi | null;
  }
  interface FastifyContextConfig {
    /** Denetim eylem adi, ornek `platform.kurum_ara`. */
    platformEylem?: string;
    /** Gereken en dusuk platform rolu (varsayilan `destek`). */
    platformRolu?: PlatformRolu;
    /** true ise ikinci adim tamamlanmis olmasi aranmaz (ikinci adim kurulum/dogrulama uclari). */
    ikinciAdimMuaf?: boolean;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uuidMi = (v: unknown): boolean => typeof v === 'string' && UUID.test(v);

export function sistemDbAl(kimlik: KimlikHizmeti): Database {
  if (!kimlik.sistemDb) {
    throw new AppError(
      503,
      errorCodes.unavailable,
      'Platform işlemleri için sistem veritabanı bağlantısı yok.',
    );
  }
  return kimlik.sistemDb;
}

/**
 * `withSistem` baglami: aktor, IP, istek kimligi ve denetim durumundaki hedef alanlari istekten gelir.
 * `neden` verilmezse eylem adindan turetilir.
 */
export function platformBaglami(
  request: FastifyRequest,
  ek: Partial<SistemBaglami> = {},
): SistemBaglami & { aktorKullaniciId: string } {
  const d = request.platformDenetim;
  const p = request.platform;
  if (!d || !p) throw new Error('platform kapısı çalışmadan platform işlemi çağrıldı');
  return {
    eylem: d.eylem,
    neden: `Platform yönetimi: ${d.eylem}`,
    aktorKullaniciId: p.kullaniciId,
    ip: request.ip,
    ...(uuidMi(request.id) ? { istekId: request.id } : {}),
    ...(d.kurumId ? { kurumId: d.kurumId } : {}),
    ...(d.hedefTuru ? { hedefTuru: d.hedefTuru } : {}),
    ...(d.hedefId ? { hedefId: d.hedefId } : {}),
    ...(d.ayrinti ? { ayrinti: d.ayrinti } : {}),
    ...ek,
  };
}

/**
 * Bir platform isleminin denetimini islemle birlikte yazdirir ve basari halinde istek icin "yazildi" isaretler.
 * Hata olursa islem geri alinir ve denetimi `onSend` hata satiri olarak yazar.
 */
export async function platformIslem<T>(
  request: FastifyRequest,
  fn: (baglam: SistemBaglami & { aktorKullaniciId: string }) => Promise<T>,
  ek: Partial<SistemBaglami> = {},
): Promise<T> {
  const sonuc = await fn(platformBaglami(request, ek));
  if (request.platformDenetim) request.platformDenetim.yazildi = true;
  return sonuc;
}

export function denetimAlanlari(
  request: FastifyRequest,
  alanlar: Partial<Omit<PlatformDenetimDurumu, 'eylem' | 'yazildi'>>,
): void {
  if (request.platformDenetim) Object.assign(request.platformDenetim, alanlar);
}

/** Yonetici rolu gereken islemler icin. */
export const yoneticiMi = (request: FastifyRequest): boolean =>
  request.platform?.rol === 'yonetici';
