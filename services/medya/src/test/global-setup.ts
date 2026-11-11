import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import postgres from 'postgres';
import type { TestProject } from 'vitest/node';

import { migrate } from '../db/migrate.js';

export interface TestDbUrls {
  adminUrl: string;
  ownerUrl: string;
  appUrl: string;
  sistemUrl: string;
  name: string;
}

export interface TestS3 {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

declare module 'vitest' {
  interface ProvidedContext {
    testDb: TestDbUrls | null;
    testS3: TestS3 | null;
    testNats: string | null;
  }
}

// Roller kume geneldir; parolalar infra/docker/postgres/init betigindeki gelistirme parolalariyla ayni.
export const TEST_APP_PASSWORD = 'medya_app';
export const TEST_SISTEM_PASSWORD = 'medya_sistem';

export function withDatabase(url: string, name: string, user?: string, password?: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  if (user) u.username = user;
  if (password) u.password = password;
  return u.toString();
}

/**
 * DATABASE_URL (superuser) tanimliysa sifirdan migrate edilmis bir veritabani; S3_ENDPOINT (+ anahtarlar)
 * tanimliysa rastgele adli bir test kovasi; NATS_URL tanimliysa NATS adresi saglar. Tanimli olmayanlarin
 * testleri acik mesajla atlanir. Paylasilan altyapida cakismamak icin her sey rastgele adlidir.
 */
export default async function setup(project: TestProject) {
  const temizleyiciler: (() => Promise<void>)[] = [];
  const sonek = `${String(process.pid)}_${Date.now().toString(36)}`;

  const base = process.env.DATABASE_URL;
  if (base) {
    const name = `kopru_medya_test_${sonek}`;
    const admin = postgres(base, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`create database ${name}`);
    await admin.end();
    await migrate({
      url: withDatabase(base, name),
      appPassword: TEST_APP_PASSWORD,
      sistemPassword: TEST_SISTEM_PASSWORD,
    });
    project.provide('testDb', {
      adminUrl: base,
      ownerUrl: withDatabase(base, name),
      appUrl: withDatabase(base, name, 'medya_app', TEST_APP_PASSWORD),
      sistemUrl: withDatabase(base, name, 'medya_sistem', TEST_SISTEM_PASSWORD),
      name,
    });
    temizleyiciler.push(async () => {
      const c = postgres(base, { max: 1, onnotice: () => undefined });
      await c.unsafe(`drop database if exists ${name} with (force)`);
      await c.end();
    });
  } else {
    project.provide('testDb', null);
  }

  const endpoint = process.env.S3_ENDPOINT ?? process.env.MEDYA_S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? process.env.MEDYA_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? process.env.MEDYA_S3_SECRET_ACCESS_KEY;
  if (endpoint && accessKeyId && secretAccessKey) {
    const bucket = `medya-test-${sonek.replaceAll('_', '-')}`;
    const s3 = new S3Client({
      endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    project.provide('testS3', { endpoint, bucket, accessKeyId, secretAccessKey });
    temizleyiciler.push(async () => {
      for (;;) {
        const liste = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
        const nesneler = (liste.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
        if (nesneler.length === 0) break;
        await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: nesneler } }));
      }
      await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
      s3.destroy();
    });
  } else {
    project.provide('testS3', null);
  }

  project.provide('testNats', process.env.NATS_URL ?? null);

  return async () => {
    for (const t of temizleyiciler.reverse()) await t();
  };
}
