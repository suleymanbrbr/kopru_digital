/**
 * `motivasyon-ayar-akisi.sh` yardimcisi (yalniz gelistirme): yerel imza anahtari, belirtec uretimi ve
 * dogrudan NATS'a yoklama olayi yayini. api'nin `plat` claim'li belirtec uretimi henuz yok (P1), bu yuzden
 * betik kendi JWKS'ini sunar ve `plat` claim'li belirteci kendi uretir.
 *
 *   tsx scripts/ayar-yardimcisi.ts anahtar <dizin>
 *   tsx scripts/ayar-yardimcisi.ts token <dizin> plat=yonetici|plat=destek|ogrenci:<kurum_id>:<uyelik_id>
 *   tsx scripts/ayar-yardimcisi.ts olay <nats_url> <kurum_id> <ogrenci_id> <yoklama_id>
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { dersYoklamaKaydedildiV1, eventSubject } from '@kopru/contracts';
import { ensureEventStream } from '@kopru/service-kit';
import { SignJWT, exportJWK, generateKeyPair, importJWK, type JWK } from 'jose';
import { connect } from 'nats';
import { uuidv7 } from 'uuidv7';

const [komut, a1, a2, a3, a4] = process.argv.slice(2);

async function anahtar(dizin: string) {
  await mkdir(dizin, { recursive: true });
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', { extractable: true });
  const genel = { ...(await exportJWK(publicKey)), kid: 'ayar-akisi', alg: 'EdDSA', use: 'sig' };
  await writeFile(join(dizin, 'jwks.json'), JSON.stringify({ keys: [genel] }));
  await writeFile(join(dizin, 'ozel.jwk'), JSON.stringify(await exportJWK(privateKey)));
}

async function token(dizin: string, tur: string) {
  const ozel = await importJWK(
    JSON.parse(await readFile(join(dizin, 'ozel.jwk'), 'utf8')) as JWK,
    'EdDSA',
  );
  let claims: Record<string, unknown>;
  if (tur.startsWith('plat=')) {
    claims = { plat: tur.slice(5), sid: uuidv7() };
  } else {
    const [, kurum, uyelik] = tur.split(':');
    claims = { kurum_id: kurum, uyelik_id: uyelik, rol: 'ogrenci', sid: uuidv7() };
  }
  const jwt = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'EdDSA', kid: 'ayar-akisi' })
    .setSubject(uuidv7())
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(ozel);
  process.stdout.write(jwt);
}

async function olay(natsUrl: string, kurumId: string, ogrenciId: string, yoklamaId: string) {
  const nc = await connect({ servers: natsUrl });
  try {
    await ensureEventStream(nc);
    const e = dersYoklamaKaydedildiV1.create({
      kurumId,
      actor: { tur: 'sistem', id: 'api' },
      correlationId: 'ayar-akisi',
      occurredAt: new Date(),
      data: {
        yoklama_id: yoklamaId,
        ders_id: uuidv7(),
        grup_id: uuidv7(),
        ogrenci_id: ogrenciId,
        brans_kodu: 'matematik',
        durum: 'geldi',
        onceki_durum: null,
        gec_dakika: null,
        isaretlenme_at: new Date().toISOString(),
        yoklama_surumu: 1,
      },
    });
    await nc.jetstream().publish(eventSubject(e), new TextEncoder().encode(JSON.stringify(e)), {
      msgID: e.id,
    });
    await nc.flush();
  } finally {
    await nc.close();
  }
}

if (komut === 'anahtar' && a1) await anahtar(a1);
else if (komut === 'token' && a1 && a2) await token(a1, a2);
else if (komut === 'olay' && a1 && a2 && a3 && a4) await olay(a1, a2, a3, a4);
else {
  console.error(
    'kullanim: anahtar <dizin> | token <dizin> <tur> | olay <nats> <kurum> <ogrenci> <yoklama>',
  );
  process.exit(2);
}
