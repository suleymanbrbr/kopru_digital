import { readdir, writeFile } from 'node:fs/promises';

import { migrate, migrationsDir } from './migrate.js';

/**
 * `db:migrate` : bekleyen migration'lari uygular (BILDIRIM_DATABASE_OWNER_URL, yoksa DATABASE_OWNER_URL/DATABASE_URL).
 * `db:generate <ad>` : siradaki numarayla bos bir SQL migration dosyasi olusturur.
 */
const [command, ...args] = process.argv.slice(2);

if (command === 'generate') {
  const name = (args[0] ?? '').replace(/[^a-z0-9_]/g, '_');
  if (!name) throw new Error('Kullanım: pnpm --filter @kopru/bildirim db:generate <ad>');
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const last = Number(files.at(-1)?.slice(0, 4) ?? '0');
  const file = `${String(last + 1).padStart(4, '0')}_${name}.sql`;
  await writeFile(
    new URL(file, migrationsDir),
    `-- ${file}: genişlet-daralt kuralına uyun; kurum_id'li tablolarda kiraci_tablosu_koru() kullanın.\n`,
  );
  console.log(`oluşturuldu: migrations/${file}`);
} else {
  const url =
    process.env.BILDIRIM_DATABASE_OWNER_URL ??
    process.env.DATABASE_OWNER_URL ??
    process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_OWNER_URL (veya DATABASE_URL) tanımlı değil');
  const applied = await migrate({
    url,
    ...(process.env.BILDIRIM_APP_PASSWORD
      ? { appPassword: process.env.BILDIRIM_APP_PASSWORD }
      : {}),
    ...(process.env.BILDIRIM_SISTEM_PASSWORD
      ? { sistemPassword: process.env.BILDIRIM_SISTEM_PASSWORD }
      : {}),
    log: (m) => {
      console.log(m);
    },
  });
  console.log(applied.length > 0 ? `${String(applied.length)} migration uygulandı.` : 'Güncel.');
}
