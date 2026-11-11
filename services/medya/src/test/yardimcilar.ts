import { createHash } from 'node:crypto';

import type { Rol } from '@kopru/contracts';
import {
  createJwtVerifier,
  createServisJwtVerifier,
  type Service,
  SERVIS_BELIRTECI_OMRU_SN,
} from '@kopru/service-kit';
import { SignJWT, generateKeyPair } from 'jose';
import sharp from 'sharp';
import { uuidv7 } from 'uuidv7';
import { inject } from 'vitest';

import { buildService } from '../app.js';
import { loadServiceEnv } from '../config.js';
import { depolamaOlustur, type Depolama } from '../depolama.js';

export const testDb = () => inject('testDb');
export const testS3 = () => inject('testS3');
export const testNats = () => inject('testNats');

export const dbYok = () => {
  const yok = testDb() === null;
  if (yok) console.warn('[medya testleri] DATABASE_URL tanımlı değil: DB testleri atlanıyor.');
  return yok;
};
export const s3Yok = () => {
  const yok = testDb() === null || testS3() === null;
  if (yok) console.warn('[medya testleri] S3_ENDPOINT/anahtarlar tanımlı değil: S3 testleri atlanıyor.');
  return yok;
};
export const natsYok = () => {
  const yok = testDb() === null || testNats() === null;
  if (yok) console.warn('[medya testleri] NATS_URL tanımlı değil: olay testleri atlanıyor.');
  return yok;
};

export const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

// --- JWT -------------------------------------------------------------------------------------
const anahtar = await generateKeyPair('EdDSA');
const keySet = async () => anahtar.publicKey;
export const kullaniciDogrulayici = createJwtVerifier({ keySet });
export const servisDogrulayici = createServisJwtVerifier({ keySet, audience: 'medya' });

export interface Kimlik {
  kullaniciId: string;
  kurumId: string;
  uyelikId: string;
  rol: Rol;
}

export const yeniKimlik = (rol: Rol, kurumId: string = uuidv7()): Kimlik => ({
  kullaniciId: uuidv7(),
  kurumId,
  uyelikId: uuidv7(),
  rol,
});

export async function kullaniciTokeni(k: Kimlik): Promise<string> {
  return new SignJWT({ kurum_id: k.kurumId, uyelik_id: k.uyelikId, rol: k.rol, sid: uuidv7() })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setSubject(k.kullaniciId)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(anahtar.privateKey);
}

export async function servisTokeni(
  options: { scope?: string; audience?: string; sub?: string } = {},
): Promise<string> {
  return new SignJWT({ scope: options.scope ?? 'medya.okuma' })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setSubject(options.sub ?? 'servis:api')
    .setAudience(options.audience ?? 'medya')
    .setIssuedAt()
    .setExpirationTime(`${String(SERVIS_BELIRTECI_OMRU_SN)}s`)
    .sign(anahtar.privateKey);
}

// --- Servis ----------------------------------------------------------------------------------
export interface TestServisi {
  service: Service;
  depolama: Depolama | null;
}

export function testServisi(
  ek: Record<string, string> = {},
  options: { simdi?: () => Date; s3Yok?: boolean } = {},
): TestServisi {
  const db = testDb();
  const s3 = testS3();
  if (!db) throw new Error('testDb yok');
  const env = loadServiceEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    AUTH_ENABLED: 'true',
    JWKS_URL: 'http://localhost/.well-known/jwks.json',
    DATABASE_URL: db.appUrl,
    DATABASE_SISTEM_URL: db.sistemUrl,
    ...(s3 && !options.s3Yok
      ? {
          S3_ENDPOINT: s3.endpoint,
          S3_BUCKET: s3.bucket,
          S3_ACCESS_KEY_ID: s3.accessKeyId,
          S3_SECRET_ACCESS_KEY: s3.secretAccessKey,
        }
      : {}),
    ...ek,
  });
  const depolama = depolamaOlustur(env);
  const service = buildService(env, {
    depolama,
    verifyJwt: kullaniciDogrulayici,
    verifyServisJwt: servisDogrulayici,
    ...(options.simdi ? { simdi: options.simdi } : {}),
  });
  return { service, depolama };
}

// --- Ornek icerik ----------------------------------------------------------------------------
/** EXIF (GPS konumu, yon=6 yani 90 derece) iceren `genislik`x`yukseklik` JPEG. */
export async function jpegExifli(genislik = 1200, yukseklik = 800): Promise<Buffer> {
  return sharp({
    create: {
      width: genislik,
      height: yukseklik,
      channels: 3,
      background: '#3366cc',
      noise: { type: 'gaussian', mean: 128, sigma: 30 },
    },
  })
    .withExif({
      IFD0: { Make: 'TestKamera', Copyright: 'gizli-sahip' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '41/1 0/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '29/1 0/1 0/1',
      },
    })
    .withMetadata({ orientation: 6 })
    .jpeg({ quality: 92 })
    .toBuffer();
}

export const png = (w = 300, h = 200) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#ffffff' } })
    .png()
    .toBuffer();

/**
 * Gecerli, sessiz MPEG-2 Layer III (8 kbps, 22.05 kHz, mono) akisi; sure saniye cinsinden. Her kare 26 bayt
 * ve 576 ornek (26.12 ms); fixture dosyasi tutmadan gercek bayt imzali ses uretir.
 */
export function mp3(sureSn: number): Buffer {
  const kare = Buffer.alloc(26);
  kare.set([0xff, 0xf3, 0x10, 0xc0]);
  const adet = Math.ceil((sureSn * 22050) / 576);
  return Buffer.concat(Array.from({ length: adet }, () => kare));
}

// --- Yukleme akisi ---------------------------------------------------------------------------
export function yetki(token: string, ek: Record<string, string> = {}) {
  return { authorization: `Bearer ${token}`, ...ek };
}

export interface YuklemeSonucu {
  id: string;
  durum: string;
  put: Response;
}

/** POST /v1/dosyalar -> presigned PUT -> POST /tamam. `tamamSonrasi` yanit kodu da doner. */
export async function yukle(
  s: TestServisi,
  token: string,
  girdi: { tur: string; mime: string; govde: Buffer; bildirilenMime?: string },
): Promise<{ id: string; tamam: { statusCode: number; json: () => unknown }; put: Response }> {
  const izin = await s.service.app.inject({
    method: 'POST',
    url: '/v1/dosyalar',
    headers: yetki(token),
    payload: {
      tur: girdi.tur,
      mime_tipi: girdi.bildirilenMime ?? girdi.mime,
      boyut_bayt: girdi.govde.length,
      sha256: sha256(girdi.govde),
      istemci_anahtari: uuidv7(),
    },
  });
  if (izin.statusCode !== 201) throw new Error(`izin: ${String(izin.statusCode)} ${izin.body}`);
  const { dosya, yukleme } = izin.json<{
    dosya: { id: string };
    yukleme: { url: string; basliklar: Record<string, string> };
  }>();
  const put = await fetch(yukleme.url, {
    method: 'PUT',
    headers: yukleme.basliklar,
    body: new Uint8Array(girdi.govde),
  });
  const tamam = await s.service.app.inject({
    method: 'POST',
    url: `/v1/dosyalar/${dosya.id}/tamam`,
    headers: yetki(token),
  });
  return { id: dosya.id, tamam, put };
}

/** drizzle hatayi sarar; veritabani mesaji `cause` icindedir. Hata beklenen istekler icin birlesik metin. */
export async function hataMetni(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    const e = err as Error & { cause?: { message?: string } };
    return `${e.message} ${e.cause?.message ?? ''}`;
  }
  throw new Error('Hata bekleniyordu ama istek basarili oldu');
}
