import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { Env } from './config.js';

export interface NesneBilgisi {
  boyutBayt: number;
  mime: string | undefined;
}

/**
 * Nesne depolama arayuzu (S3 uyumlu). Servis ici islemler (`HEAD`/`GET`/`PUT`/`DELETE`) `S3_ENDPOINT`
 * uzerinden, istemciye verilen presigned adresler `S3_GENEL_ENDPOINT` ana makinesiyle imzalanir
 * (simulator ve tarayici `localhost:9000`'e ulasir). Imzalama cevrimdisidir: genel adrese ag cagrisi yapilmaz.
 */
export interface Depolama {
  readonly kova: string;
  /** Presigned PUT: `Content-Type` ve `Content-Length` imzaya dahildir. */
  yuklemeAdresi(input: {
    anahtar: string;
    mime: string;
    boyutBayt: number;
    omurSn: number;
  }): Promise<{ url: string; basliklar: Record<string, string> }>;
  /** Presigned GET. */
  okumaAdresi(anahtar: string, omurSn: number): Promise<string>;
  /** Nesne yoksa `null`. */
  bilgi(anahtar: string): Promise<NesneBilgisi | null>;
  /** Nesneyi tamamen okur; `azamiBayt` asilirsa hata firlatir. */
  oku(anahtar: string, azamiBayt: number): Promise<Buffer>;
  yaz(anahtar: string, govde: Buffer, mime: string): Promise<void>;
  /** Olmayan nesne hata sayilmaz. */
  sil(anahtarlar: readonly string[]): Promise<void>;
  /** Kova yoksa olusturur, CORS kuralini (tarayicidan dogrudan PUT/GET) ayarlar. Idempotent. */
  kovaHazirla(izinliOriginler: readonly string[]): Promise<void>;
  kapat(): void;
}

export class DepolamaHatasi extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DepolamaHatasi';
  }
}

function bulunamadi(err: unknown): boolean {
  if (err instanceof S3ServiceException) {
    return err.$metadata.httpStatusCode === 404 || err.name === 'NotFound' || err.name === 'NoSuchKey';
  }
  return false;
}

export function depolamaOlustur(env: Env): Depolama | null {
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) return null;
  const credentials = {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  };
  // WHEN_REQUIRED: SDK'nin varsayilan CRC32 sağlama baslıgı presigned URL'e eklenirse tarayici/mobil
  // istemci bunu bilmedigi icin yukleme reddedilir; saglama toplami dogrulamasini sha256 ile kendimiz yapariz.
  const ortak = {
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  } as const;
  const ic = new S3Client({ ...ortak, endpoint: env.S3_ENDPOINT });
  const genel = new S3Client({ ...ortak, endpoint: env.S3_GENEL_ENDPOINT ?? env.S3_ENDPOINT });
  const Bucket = env.S3_BUCKET;

  return {
    kova: Bucket,

    async yuklemeAdresi({ anahtar, mime, boyutBayt, omurSn }) {
      const url = await getSignedUrl(
        genel,
        new PutObjectCommand({
          Bucket,
          Key: anahtar,
          ContentType: mime,
          ContentLength: boyutBayt,
        }),
        { expiresIn: omurSn, signableHeaders: new Set(['content-type', 'content-length']) },
      );
      return { url, basliklar: { 'Content-Type': mime } };
    },

    okumaAdresi(anahtar, omurSn) {
      return getSignedUrl(genel, new GetObjectCommand({ Bucket, Key: anahtar }), {
        expiresIn: omurSn,
      });
    },

    async bilgi(anahtar) {
      try {
        const r = await ic.send(new HeadObjectCommand({ Bucket, Key: anahtar }));
        return { boyutBayt: r.ContentLength ?? 0, mime: r.ContentType };
      } catch (err) {
        if (bulunamadi(err)) return null;
        throw new DepolamaHatasi('Nesne bilgisi alınamadı', { cause: err });
      }
    },

    async oku(anahtar, azamiBayt) {
      try {
        const r = await ic.send(new GetObjectCommand({ Bucket, Key: anahtar }));
        if ((r.ContentLength ?? 0) > azamiBayt) {
          throw new DepolamaHatasi('Nesne beklenenden büyük');
        }
        if (!r.Body) throw new DepolamaHatasi('Nesne gövdesi boş');
        return Buffer.from(await r.Body.transformToByteArray());
      } catch (err) {
        if (err instanceof DepolamaHatasi) throw err;
        throw new DepolamaHatasi('Nesne okunamadı', { cause: err });
      }
    },

    async yaz(anahtar, govde, mime) {
      try {
        await ic.send(
          new PutObjectCommand({ Bucket, Key: anahtar, Body: govde, ContentType: mime }),
        );
      } catch (err) {
        throw new DepolamaHatasi('Nesne yazılamadı', { cause: err });
      }
    },

    async sil(anahtarlar) {
      if (anahtarlar.length === 0) return;
      try {
        const r = await ic.send(
          new DeleteObjectsCommand({
            Bucket,
            Delete: { Objects: anahtarlar.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        if ((r.Errors?.length ?? 0) > 0) {
          throw new DepolamaHatasi(`Nesneler silinemedi: ${r.Errors?.[0]?.Code ?? 'bilinmiyor'}`);
        }
      } catch (err) {
        if (err instanceof DepolamaHatasi) throw err;
        throw new DepolamaHatasi('Nesneler silinemedi', { cause: err });
      }
    },

    async kovaHazirla(izinliOriginler) {
      try {
        await ic.send(new HeadBucketCommand({ Bucket }));
      } catch (err) {
        if (!bulunamadi(err)) throw new DepolamaHatasi('Kova denetlenemedi', { cause: err });
        await ic.send(new CreateBucketCommand({ Bucket }));
      }
      if (izinliOriginler.length === 0) return;
      await ic.send(
        new PutBucketCorsCommand({
          Bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: [...izinliOriginler],
                AllowedMethods: ['PUT', 'GET', 'HEAD'],
                AllowedHeaders: ['*'],
                ExposeHeaders: ['ETag'],
                MaxAgeSeconds: 3000,
              },
            ],
          },
        }),
      );
    },

    kapat() {
      ic.destroy();
      genel.destroy();
    },
  };
}
