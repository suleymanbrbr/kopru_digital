import { parseArgs } from 'node:util';

import { createDb } from '@kopru/service-kit';
import { z } from 'zod';

import { kurumsalAboneligiAktiflestir } from './modules/abonelik/index.js';

/**
 * `abonelik-kurumsal --kurum <uuid> --plan <kod> --sozlesme <no> --aktor <uuid> [--periyot aylik|yillik]
 * [--bitis <ISO tarih>] [--fiyat <kurus>] [--neden "..."]`
 * Teklif + fatura ile elle (kurumsal) aktivasyon. Platform paneli gelene kadar operasyon aracidir; panel ayni
 * servis fonksiyonunu (`kurumsalAboneligiAktiflestir`) cagirir. Sistem rolu (`API_DATABASE_SISTEM_URL`) ile
 * baglanir; islem `hesap.denetim_kayitlari`na `--neden` ile yazilir.
 */
const KULLANIM =
  'Kullanım: pnpm --filter @kopru/api abonelik-kurumsal -- --kurum <uuid> --plan <kod> --sozlesme <no> --aktor <uuid> [--periyot aylik|yillik] [--bitis <ISO>] [--fiyat <kuruş>] [--neden "..."]';

const argv = process.argv.slice(2).filter((a, i) => !(i === 0 && a === '--'));
const { values } = parseArgs({
  args: argv,
  options: {
    kurum: { type: 'string' },
    plan: { type: 'string' },
    sozlesme: { type: 'string' },
    aktor: { type: 'string' },
    periyot: { type: 'string' },
    bitis: { type: 'string' },
    fiyat: { type: 'string' },
    neden: { type: 'string' },
  },
  strict: true,
});

const girdi = z
  .object({
    kurum: z.uuid(),
    plan: z.string().min(1),
    sozlesme: z.string().min(1),
    aktor: z.uuid(),
    periyot: z.enum(['aylik', 'yillik']).default('aylik'),
    bitis: z.iso.datetime({ offset: true }).or(z.iso.date()).optional(),
    fiyat: z.coerce.number().int().nonnegative().optional(),
    neden: z.string().min(5).default('Teklif ve fatura ile elle aktivasyon'),
  })
  .safeParse(values);
if (!girdi.success) {
  console.error(`Geçersiz argüman: ${girdi.error.message}\n${KULLANIM}`);
  process.exit(2);
}
const url = process.env.API_DATABASE_SISTEM_URL ?? process.env.DATABASE_SISTEM_URL;
if (!url) {
  console.error('API_DATABASE_SISTEM_URL (veya DATABASE_SISTEM_URL) tanımlı değil.');
  process.exit(2);
}

const g = girdi.data;
const db = createDb({ url, max: 2 });
let cikis = 0;
try {
  const sonuc = await kurumsalAboneligiAktiflestir(db, {
    kurumId: g.kurum,
    planKodu: g.plan,
    sozlesmeNo: g.sozlesme,
    periyot: g.periyot,
    aktorKullaniciId: g.aktor,
    neden: g.neden,
    ...(g.bitis ? { donemBitisAt: new Date(g.bitis) } : {}),
    ...(g.fiyat === undefined ? {} : { fiyatKurus: g.fiyat }),
  });
  console.log(
    JSON.stringify({
      abonelik_id: sonuc.abonelik.id,
      plan: sonuc.plan.kod,
      kaynak: sonuc.abonelik.kaynak,
      durum: sonuc.abonelik.durum,
      donem_bitis_at: sonuc.abonelik.donem_bitis_at.toISOString(),
    }),
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  cikis = 1;
} finally {
  await db.close();
}
process.exit(cikis);
