import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

import { renderOutboxMigration } from '@kopru/service-kit';
import postgres, { type Sql } from 'postgres';

export const migrationsDir = new URL('../../migrations/', import.meta.url);

const OUTBOX_MARKER = /^-- @outbox-sablonu (\w+)\s*$/m;

export interface MigrateOptions {
  /** Migration baglantisi: `medya_owner` rolune SET ROLE yapabilen kullanici (veya superuser). */
  url: string;
  /** Verilirse `medya_app` / `medya_sistem` rollerinin sifresi ayarlanir (dev/test). */
  appPassword?: string;
  sistemPassword?: string;
  log?: (message: string) => void;
}

async function ensureRole(sql: Sql, name: string, definition: string) {
  const rows = await sql`select 1 from pg_roles where rolname = ${name}`;
  if (rows.length > 0) return;
  try {
    await sql.unsafe(`create role ${name} ${definition}`);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === '42710' || code === '23505') return; // es zamanli olusturma
    throw new Error(
      `Rol ${name} yok ve oluşturulamadı (${String(err)}). Altyapı betiği (infra/docker/postgres/init) ile oluşturun.`,
      { cause: err },
    );
  }
}

/** Roller ve veritabani yetkileri: migration kullanicisinin yetkisiyle, SET ROLE oncesi. */
async function bootstrap(sql: Sql, options: MigrateOptions) {
  await ensureRole(sql, 'medya_owner', 'nologin');
  await ensureRole(sql, 'medya_app', 'login nosuperuser nobypassrls');
  await ensureRole(sql, 'medya_sistem', 'login nosuperuser bypassrls');
  if (options.appPassword) {
    await sql.unsafe(
      `alter role medya_app password '${options.appPassword.replaceAll("'", "''")}'`,
    );
  }
  if (options.sistemPassword) {
    await sql.unsafe(
      `alter role medya_sistem password '${options.sistemPassword.replaceAll("'", "''")}'`,
    );
  }
  const [{ db, usr, super: isSuper } = { db: '', usr: '', super: false }] = await sql<
    { db: string; usr: string; super: boolean }[]
  >`select current_database() db, current_user usr, (select rolsuper from pg_roles where rolname = current_user) super`;
  await sql.unsafe(`grant create, connect on database "${db}" to medya_owner`);
  await sql.unsafe(`grant connect on database "${db}" to medya_app, medya_sistem`);
  if (!isSuper) {
    try {
      await sql.unsafe(`grant medya_owner to "${usr}"`);
    } catch {
      // zaten uye ya da yetki yok: SET ROLE asamasi acik hata verir
    }
  }
}

async function loadMigration(name: string): Promise<string> {
  let text = await readFile(new URL(name, migrationsDir), 'utf8');
  const marker = OUTBOX_MARKER.exec(text);
  if (marker?.[1]) text = text.replace(OUTBOX_MARKER, await renderOutboxMigration(marker[1]));
  return text;
}

/** Bekleyen migration'lari uygular. Birden cok kosan migrator advisory lock ile siralanir. */
export async function migrate(options: MigrateOptions): Promise<string[]> {
  const log = options.log ?? (() => undefined);
  const sql = postgres(options.url, { max: 1, onnotice: () => undefined });
  const applied: string[] = [];
  try {
    await bootstrap(sql, options);
    await sql`select pg_advisory_lock(727002)`;
    try {
      await sql.unsafe('set role medya_owner');
      await sql.unsafe('create schema if not exists ortak');
      await sql.unsafe(`create table if not exists ortak.migrasyonlar (
        id text primary key, sha256 text not null, uygulandi_at timestamptz not null default now())`);
      const done = new Map(
        (
          await sql<{ id: string; sha256: string }[]>`select id, sha256 from ortak.migrasyonlar`
        ).map((r) => [r.id, r.sha256]),
      );
      const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
      for (const file of files) {
        const text = await loadMigration(file);
        const sha = createHash('sha256').update(text).digest('hex');
        const previous = done.get(file);
        if (previous !== undefined) {
          if (previous !== sha) throw new Error(`Uygulanmış migration değiştirilmiş: ${file}`);
          continue;
        }
        await sql.begin(async (tx) => {
          await tx.unsafe(text);
          await tx`insert into ortak.migrasyonlar (id, sha256) values (${file}, ${sha})`;
        });
        applied.push(file);
        log(`uygulandı: ${file}`);
      }
    } finally {
      await sql.unsafe('reset role');
      await sql`select pg_advisory_unlock(727002)`;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
  return applied;
}
