import { errorCodes } from '@kopru/contracts';
import { AppError, istegiSaltOkunurYap } from '@kopru/service-kit';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { platformDenetimYaz } from '../../../sistem/platform-denetim.js';
import {
  oturumIkinciAdimDurumu,
  platformKullanicisiGetir,
} from '../../../sistem/platform-kimlik.js';
import { taklitGecerliMi, taklitIstegiDenetle } from '../../../sistem/platform-taklit.js';
import type { KimlikHizmeti } from '../kimlik.js';
import { ipIzinListesi } from './ip-izin.js';
import { sistemDbAl, uuidMi } from './ortak.js';
import { HataSayaci } from './sayac.js';

declare module 'fastify' {
  interface FastifyInstance {
    hataSayaci: HataSayaci;
  }
  interface FastifyRequest {
    /** Taklit belirteciyle gelen istegin baglami (`imp` claim'i varsa). */
    taklit: {
      taklitId: string;
      aktorId: string | null;
      kurumId: string | null;
      hedefKullaniciId: string;
    } | null;
  }
}

const OKUMA = new Set(['GET', 'HEAD', 'OPTIONS']);

const yasak = (kod: string, mesaj: string) => new AppError(403, kod, mesaj);

/** Yanit govdesindeki hata kodunu (varsa) cikarir. */
function hataKodu(payload: unknown): string | undefined {
  if (typeof payload !== 'string') return undefined;
  try {
    const kod = (JSON.parse(payload) as { error?: { code?: unknown } }).error?.code;
    return typeof kod === 'string' ? kod : undefined;
  } catch {
    return undefined;
  }
}

/**
 * IP izin kontrolu: liste tanimliysa istemci (`request.ip`, ADR 0009) listede olmali; liste bossa
 * gelistirmede/testte acik, uretimde kapali (fail-closed).
 */
export function ipKontrolcusuOlustur(kimlik: KimlikHizmeti): (request: FastifyRequest) => void {
  const izinli = ipIzinListesi(kimlik.env.PLATFORM_IP_IZINLI);
  const uretim = kimlik.env.NODE_ENV === 'production';
  return (request) => {
    if (izinli === null) {
      if (uretim) {
        throw yasak(
          errorCodes.platformIpYasak,
          'Platform erişimi bu ortamda yapılandırılmamış (PLATFORM_IP_IZINLI).',
        );
      }
      return;
    }
    if (!izinli(request.ip)) {
      throw yasak(errorCodes.platformIpYasak, 'Bu adresten platform erişimine izin verilmiyor.');
    }
  };
}

/**
 * Kokte (tum rotalar) calisan platform kancalari:
 * - HTTP sayaci (5xx orani, sistem sagligi icin),
 * - taklit belirteci: canli dogrulama (sonlandirilmis/suresi dolmus -> 401), salt okunur zorunlulugu
 *   (yazma yontemleri 403 `taklit_salt_okunur`, ADR 0004 adim 8), IP izin listesi ve her istegin denetimi.
 */
export function platformKokKancalari(app: FastifyInstance, kimlik: KimlikHizmeti): void {
  app.decorateRequest('platformDenetim', null);
  app.decorateRequest('platform', null);
  app.decorateRequest('taklit', null);
  const sayac = new HataSayaci();
  app.decorate('hataSayaci', sayac);
  const ipKontrol = ipKontrolcusuOlustur(kimlik);

  app.addHook('onRequest', async (request) => {
    const auth = request.auth;
    const imp = auth?.claims.imp;
    if (!auth || imp === undefined) return;
    const veri = typeof imp === 'object' && imp !== null ? (imp as Record<string, unknown>) : {};
    const taklitId = veri.taklit_id;
    const aktor = auth.claims.aktor;
    request.taklit = {
      taklitId: typeof taklitId === 'string' ? taklitId : '',
      aktorId: typeof aktor === 'string' ? aktor : null,
      kurumId: auth.kurumId,
      hedefKullaniciId: auth.kullaniciId,
    };
    // Son guvence (ADR 0004 adim 8): bu istegin tum veritabani islemleri `READ ONLY` baslar.
    istegiSaltOkunurYap();
    // Canli dogrulama: sonlandirilmis, suresi dolmus veya baska hedefe ait kayit -> 401.
    const gecersiz = () => new AppError(401, errorCodes.unauthorized, 'Taklit oturumu sona ermiş.');
    if (typeof taklitId !== 'string' || !uuidMi(taklitId) || !auth.kurumId) throw gecersiz();
    const gecerli = await taklitGecerliMi(sistemDbAl(kimlik), {
      taklitId,
      hedefKullaniciId: auth.kullaniciId,
      kurumId: auth.kurumId,
    });
    if (!gecerli) throw gecersiz();
    request.taklit.aktorId = gecerli.aktorId;
    ipKontrol(request);
    if (!OKUMA.has(request.method)) {
      throw yasak(errorCodes.taklitSaltOkunur, 'Taklit oturumunda değişiklik yapılamaz.');
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    sayac.kaydet(reply.statusCode);
    const t = request.taklit;
    if (t) {
      try {
        await taklitIstegiDenetle(kimlik.sistemDb, {
          taklitId: t.taklitId,
          aktorId: t.aktorId ?? '',
          kurumId: t.kurumId ?? '',
          hedefKullaniciId: t.hedefKullaniciId,
          yontem: request.method,
          yol: request.routeOptions.url ?? request.url.split('?')[0] ?? '',
          durum: reply.statusCode,
          ip: request.ip,
          ...(uuidMi(request.id) ? { istekId: request.id } : {}),
        });
      } catch (err) {
        request.log.error({ err }, 'taklit istek denetimi yazılamadı');
      }
    }
    return payload;
  });
}

/**
 * `/platform/*` kapisi (kapsullenmis plugin icinde kaydedilir). Sira: IP -> taklit belirteci olmamali ->
 * `plat` claim'i -> veritabaninda aktif platform rolu -> ikinci adim (muaf degilse) -> rota rolu.
 * Her istek (reddedilenler dahil) `onSend`te bir denetim satiri olarak yazilir; veri degistiren islemler
 * denetimi islemle birlikte yazdirip `yazildi` isaretler.
 */
export function platformKapisiKur(app: FastifyInstance, kimlik: KimlikHizmeti): void {
  const ipKontrol = ipKontrolcusuOlustur(kimlik);
  const omurSn = kimlik.env.PLATFORM_IKINCI_ADIM_OMRU_SN;

  // Platform kullanicilari kurum uyesi olmayabilir: KVKK riza kapisindan (kurum bagli) muaf.
  app.addHook('onRoute', (rota) => {
    rota.config = { rizaMuaf: true, ...(rota.config ?? {}) };
  });

  app.addHook('onRequest', async (request) => {
    const auth = request.auth;
    if (!auth) throw new AppError(401, errorCodes.unauthorized, 'Oturum açmanız gerekiyor.');
    const config = request.routeOptions.config;
    const eylem = config.platformEylem ?? 'platform.istek';
    request.platformDenetim = { eylem, yazildi: false };
    const reddet = (neden: string, hata: AppError): never => {
      request.platformDenetim = {
        eylem,
        yazildi: false,
        ayrinti: { red: neden },
      };
      throw hata;
    };
    try {
      ipKontrol(request);
    } catch (err) {
      return reddet('ip', err as AppError);
    }
    if (auth.claims.imp !== undefined) {
      return reddet(
        'taklit',
        yasak(errorCodes.platformYetkisiYok, 'Taklit belirteciyle platform uçları çağrılamaz.'),
      );
    }
    const plat = auth.claims.plat;
    if (plat !== 'destek' && plat !== 'yonetici') {
      return reddet('plat_claim', yasak(errorCodes.platformYetkisiYok, 'Platform yetkiniz yok.'));
    }
    const sistemDb = sistemDbAl(kimlik);
    const kullanici = await platformKullanicisiGetir(sistemDb, auth.kullaniciId);
    if (!kullanici) {
      return reddet('rol_yok', yasak(errorCodes.platformYetkisiYok, 'Platform yetkiniz yok.'));
    }
    request.platform = { kullaniciId: kullanici.id, rol: kullanici.rol };

    if (config.ikinciAdimMuaf !== true) {
      const oturum = auth.sessionId
        ? await oturumIkinciAdimDurumu(sistemDb, auth.sessionId)
        : { gecerli: false, ikinciAdimAt: null };
      if (!oturum.gecerli) {
        throw new AppError(401, errorCodes.unauthorized, 'Oturumunuz geçersiz veya süresi dolmuş.');
      }
      const taze =
        oturum.ikinciAdimAt !== null && Date.now() - oturum.ikinciAdimAt.getTime() < omurSn * 1000;
      if (!taze) {
        return reddet(
          'ikinci_adim',
          yasak(
            errorCodes.ikinciAdimGerekli,
            'Platform işlemleri için iki adımlı doğrulamayı tamamlayın.',
          ),
        );
      }
    }
    if (config.platformRolu === 'yonetici' && kullanici.rol !== 'yonetici') {
      return reddet(
        'rol_yetersiz',
        yasak(errorCodes.platformIzinYok, 'Bu işlem için platform yöneticisi rolü gerekir.'),
      );
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const d = request.platformDenetim;
    const auth = request.auth;
    if (!d || d.yazildi || !auth) return payload;
    const durum = reply.statusCode;
    const kod = durum >= 400 ? hataKodu(payload) : undefined;
    try {
      await platformDenetimYaz(kimlik.sistemDb, {
        eylem: d.eylem,
        neden: `Platform yönetimi: ${d.eylem}`,
        aktorKullaniciId: auth.kullaniciId,
        ip: request.ip,
        ...(uuidMi(request.id) ? { istekId: request.id } : {}),
        ...(d.kurumId ? { kurumId: d.kurumId } : {}),
        ...(d.hedefTuru ? { hedefTuru: d.hedefTuru } : {}),
        ...(d.hedefId ? { hedefId: d.hedefId } : {}),
        ayrinti: { ...d.ayrinti, durum, ...(kod ? { kod } : {}) },
      });
    } catch (err) {
      request.log.error({ err, eylem: d.eylem }, 'platform denetimi yazılamadı');
    }
    return payload;
  });
}
