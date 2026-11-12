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
    testNats: string | null;
  }
}

// Roller kume geneldir; parolalar infra/docker/postgres/init betigindeki gelistirme parolalariyla ayni.
export const TEST_APP_PASSWORD = 'motivasyon_app';
export const TEST_SISTEM_PASSWORD = 'motivasyon_sistem';

export function withDatabase(url: string, name: string, user?: string, password?: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  if (user) u.username = user;
  if (password) u.password = password;
  return u.toString();
}

/**
 * DATABASE_URL (superuser) tanimliysa sifirdan migrate edilmis, rastgele adli bir veritabani; NATS_URL
 * tanimliysa NATS adresi saglar. Tanimli olmayanlarin testleri acik mesajla atlanir.
 */
export default async function setup(project: TestProject) {
  const temizleyiciler: (() => Promise<void>)[] = [];
  const sonek = `${String(process.pid)}_${Date.now().toString(36)}`;

  const base = process.env.DATABASE_URL;
  if (base) {
    const name = `kopru_motivasyon_test_${sonek}`;
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
      appUrl: withDatabase(base, name, 'motivasyon_app', TEST_APP_PASSWORD),
      sistemUrl: withDatabase(base, name, 'motivasyon_sistem', TEST_SISTEM_PASSWORD),
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

  project.provide('testNats', process.env.NATS_URL ?? null);

  return async () => {
    for (const t of temizleyiciler.reverse()) await t();
  };
}
