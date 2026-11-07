import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

import type { Database } from '@kopru/service-kit';
import { and, desc, gt, isNull, or, sql } from 'drizzle-orm';
import {
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  importJWK,
  importPKCS8,
  type CryptoKey,
  type JWK,
  type JWTVerifyGetKey,
} from 'jose';
import { uuidv7 } from 'uuidv7';

import { jwks } from '../../db/schema.js';

const GUN_MS = 86_400_000;
/** ADR 0004: 90 gunde bir yeni anahtar; eskisi 30 gun daha JWKS'te kalir. */
export const ANAHTAR_OMRU_MS = 90 * GUN_MS;
const JWKS_KALMA_MS = 120 * GUN_MS;
const ONBELLEK_MS = 60_000;

interface YuklenenAnahtar {
  kid: string;
  genel: CryptoKey;
  jwk: JWK;
  olusturma: Date;
  imza?: CryptoKey;
}

/** JWT imza anahtarlari: `hesap.jwks` tablosunda, ozel anahtar AES-256-GCM ile sifreli. */
export class AnahtarDeposu {
  private readonly sifrelemeAnahtari: Buffer;
  private onbellek: { yuklendi: number; anahtarlar: YuklenenAnahtar[] } | null = null;

  constructor(
    private readonly getDb: () => Database,
    sir: string,
  ) {
    this.sifrelemeAnahtari = Buffer.from(
      hkdfSync('sha256', sir, 'kopru-api', 'jwks-ozel-anahtar', 32),
    );
  }

  private sifrele(duz: string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.sifrelemeAnahtari, iv);
    const veri = Buffer.concat([cipher.update(duz, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), veri]);
  }

  private coz(veri: Buffer): string {
    const decipher = createDecipheriv('aes-256-gcm', this.sifrelemeAnahtari, veri.subarray(0, 12));
    decipher.setAuthTag(veri.subarray(12, 28));
    return Buffer.concat([decipher.update(veri.subarray(28)), decipher.final()]).toString('utf8');
  }

  private async yukle(): Promise<YuklenenAnahtar[]> {
    const simdi = new Date();
    const satirlar = await this.getDb()
      .orm.select()
      .from(jwks)
      .where(or(isNull(jwks.expires_at), gt(jwks.expires_at, simdi)))
      .orderBy(desc(jwks.created_at));
    return Promise.all(
      satirlar.map(async (satir) => {
        const jwk = JSON.parse(satir.acik_anahtar) as JWK;
        const genel = (await importJWK(jwk, 'EdDSA')) as CryptoKey;
        return {
          kid: satir.id,
          genel,
          jwk: { ...jwk, kid: satir.id, alg: 'EdDSA', use: 'sig' },
          olusturma: satir.created_at,
        };
      }),
    );
  }

  private async yenile(): Promise<YuklenenAnahtar[]> {
    const anahtarlar = await this.yukle();
    this.onbellek = { yuklendi: Date.now(), anahtarlar };
    return anahtarlar;
  }

  private async anahtarlar(): Promise<YuklenenAnahtar[]> {
    if (this.onbellek && Date.now() - this.onbellek.yuklendi < ONBELLEK_MS) {
      return this.onbellek.anahtarlar;
    }
    return this.yenile();
  }

  /** Gecerli (90 gunden yeni) imza anahtari yoksa uretir. Es zamanli surecler advisory lock ile siralanir. */
  private async imzaAnahtariUret(): Promise<void> {
    const { publicKey, privateKey } = await generateKeyPair('EdDSA', {
      crv: 'Ed25519',
      extractable: true,
    });
    const jwk = await exportJWK(publicKey);
    const pem = await exportPKCS8(privateKey);
    const simdi = Date.now();
    await this.getDb().orm.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(727002)`);
      const [taze] = await tx
        .select({ id: jwks.id })
        .from(jwks)
        .where(and(gt(jwks.created_at, new Date(simdi - ANAHTAR_OMRU_MS))))
        .limit(1);
      if (taze) return;
      await tx.insert(jwks).values({
        id: uuidv7(),
        acik_anahtar: JSON.stringify(jwk),
        ozel_anahtar_sifreli: this.sifrele(pem),
        algoritma: 'EdDSA',
        expires_at: new Date(simdi + JWKS_KALMA_MS),
      });
    });
  }

  /** Imzalamak icin en yeni anahtar. */
  async imzaAnahtari(): Promise<{ kid: string; key: CryptoKey }> {
    let liste = await this.anahtarlar();
    let anahtar = liste.find((a) => Date.now() - a.olusturma.getTime() < ANAHTAR_OMRU_MS);
    if (!anahtar) {
      await this.imzaAnahtariUret();
      liste = await this.yenile();
      anahtar = liste.find((a) => Date.now() - a.olusturma.getTime() < ANAHTAR_OMRU_MS);
    }
    if (!anahtar) throw new Error('JWT imza anahtarı üretilemedi');
    if (!anahtar.imza) {
      const [satir] = await this.getDb()
        .orm.select({ ozel: jwks.ozel_anahtar_sifreli })
        .from(jwks)
        .where(sql`${jwks.id} = ${anahtar.kid}`);
      if (!satir) throw new Error('JWT imza anahtarı bulunamadı');
      anahtar.imza = await importPKCS8(this.coz(satir.ozel), 'EdDSA');
    }
    return { kid: anahtar.kid, key: anahtar.imza };
  }

  /** `/.well-known/jwks.json` icerigi. */
  async jwks(): Promise<{ keys: JWK[] }> {
    await this.imzaAnahtari(); // en az bir anahtar var olsun
    return { keys: (await this.anahtarlar()).map((a) => a.jwk) };
  }

  /** `jose` dogrulama anahtar kaynagi: bilinmeyen `kid` gorulurse onbellek aninda yenilenir. */
  readonly keySet: JWTVerifyGetKey = async (header) => {
    const kid = header.kid;
    let anahtar = (await this.anahtarlar()).find((a) => a.kid === kid);
    anahtar ??= (await this.yenile()).find((a) => a.kid === kid);
    if (!anahtar) throw new Error('bilinmeyen kid');
    return anahtar.genel;
  };
}
