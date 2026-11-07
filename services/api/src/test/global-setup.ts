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

declare module 'vitest' {
  interface ProvidedContext {
    testDb: TestDbUrls | null;
  }
}

// Roller kume (cluster) genelidir: testler ayni Postgres'te yerel gelistirme ile birlikte calisir.
// Farkli bir parola atamak `pnpm test` sonrasinda yerel api'nin baglanmasini bozuyordu; bu yuzden
// degerler infra/docker/postgres/init betigindeki gelistirme parolalariyla aynidir.
export const TEST_APP_PASSWORD = 'api_app';
export const TEST_SISTEM_PASSWORD = 'api_sistem';

export function withDatabase(url: string, name: string, user?: string, password?: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  if (user) u.username = user;
  if (password) u.password = password;
  return u.toString();
}

/**
 * DATABASE_URL (superuser) tanimliysa tum test dosyalarinin paylastigi, sifirdan migrate edilmis
 * bir veritabani olusturur. Tanimli degilse testler acik mesajla atlanir.
 */
export default async function setup(project: TestProject) {
  const base = process.env.DATABASE_URL;
  if (!base) {
    project.provide('testDb', null);
    return undefined;
  }
  const name = `kopru_api_test_${String(process.pid)}_${Date.now().toString(36)}`;
  const admin = postgres(base, { max: 1, onnotice: () => undefined });
  await admin.unsafe(`create database ${name}`);
  await admin.end();
  const ownerUrl = withDatabase(base, name);
  await migrate({
    url: ownerUrl,
    appPassword: TEST_APP_PASSWORD,
    sistemPassword: TEST_SISTEM_PASSWORD,
  });
  project.provide('testDb', {
    adminUrl: base,
    ownerUrl,
    appUrl: withDatabase(base, name, 'api_app', TEST_APP_PASSWORD),
    sistemUrl: withDatabase(base, name, 'api_sistem', TEST_SISTEM_PASSWORD),
    name,
  });
  return async () => {
    const cleaner = postgres(base, { max: 1, onnotice: () => undefined });
    await cleaner.unsafe(`drop database if exists ${name} with (force)`);
    await cleaner.end();
  };
}
