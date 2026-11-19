import { createDb, saltOkunurCalistir, withTenant } from '@kopru/service-kit';
import { sql } from 'drizzle-orm';

/**
 * GELISTIRME/DENEME ARACI (platform-entegrasyon-akisi.sh): salt okunur (taklit) istek baglaminda `withTenant`
 * islemi `set transaction read only` ile baslar; yazma veritabani tarafindan reddedilir. Gercek `api_app`
 * baglantisiyla (API_DATABASE_URL) hedef kurumun `hesap.modul_ayarlari` tablosuna yazmayi dener.
 *
 *   tsx scripts/salt-okunur-deneme.ts <kurum_id>
 */
const kurumId = process.argv[2];
const url = process.env.API_DATABASE_URL;
if (!kurumId || !url) {
  console.error('Kullanım: API_DATABASE_URL=... tsx scripts/salt-okunur-deneme.ts <kurum_id>');
  process.exit(2);
}
const db = createDb({ url, max: 1 });
const yaz = (tx: Parameters<Parameters<typeof withTenant>[2]>[0]) =>
  tx.execute(sql`
    insert into hesap.modul_ayarlari (id, kurum_id, modul_kodu, kapsam, kapsam_id, acik)
    values (gen_random_uuid(), ${kurumId}::uuid, 'takvim', 'kurum', ${kurumId}::uuid, false)`);
const hataMetni = async (islem: Promise<unknown>): Promise<string> => {
  try {
    await islem;
    return '';
  } catch (err) {
    const e = err as { message: string; cause?: { message?: string } };
    return e.cause?.message ?? e.message;
  }
};
try {
  const salt = await saltOkunurCalistir(() => hataMetni(withTenant(db, { kurumId }, yaz)));
  console.log(
    `salt okunur baglam: ${salt === '' ? 'YAZMA GECTI (HATA)' : `reddedildi -> ${salt}`}`,
  );
  if (!/read-only/i.test(salt)) process.exit(1);
  console.log('ok: taklit baglaminda DB yazmayi reddetti');
} finally {
  await db.close();
}
