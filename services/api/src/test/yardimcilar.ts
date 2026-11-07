import { randomInt } from 'node:crypto';

import type { Service } from '@kopru/service-kit';
import { inject } from 'vitest';

import { buildService } from '../app.js';
import { loadServiceEnv } from '../config.js';
import { YakalayanSmsGonderici } from '../modules/hesap/index.js';

import type { TestDbUrls } from './global-setup.js';

export function testDb(): TestDbUrls | null {
  return inject('testDb');
}

export const dbYok = () => {
  const yok = testDb() === null;
  if (yok) console.warn('[api testleri] DATABASE_URL tanımlı değil: DB testleri atlanıyor.');
  return yok;
};

export interface TestServisi {
  service: Service;
  sms: YakalayanSmsGonderici;
}

export function testServisi(ekEnv: Record<string, string> = {}): TestServisi {
  const urls = testDb();
  if (!urls) throw new Error('testDb yok');
  const sms = new YakalayanSmsGonderici();
  const env = loadServiceEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: urls.appUrl,
    DATABASE_SISTEM_URL: urls.sistemUrl,
    ...ekEnv,
  });
  return { service: buildService(env, { sms }), sms };
}

let ipSayaci = randomInt(1, 200);
/** Her giris icin ayri istemci IP'si: OTP IP hiz siniri testler arasi sizmasin. */
export const yeniIp = () => `10.${String(randomInt(0, 255))}.${String(ipSayaci++ % 250)}.${String(randomInt(1, 254))}`;

export const rastgeleTelefon = () => `+9055${String(randomInt(10_000_000, 99_999_999))}`;

export interface GirisSonucu {
  telefon: string;
  oturum: string;
  kullaniciId: string;
}

/** OTP gonder + dogrula; SMS kodu yakalayicidan okunur. */
export async function otpIleGiris(
  { service, sms }: TestServisi,
  telefon = rastgeleTelefon(),
): Promise<GirisSonucu> {
  const remoteAddress = yeniIp();
  const gonder = await service.app.inject({
    method: 'POST',
    url: '/auth/otp/gonder',
    remoteAddress,
    payload: { telefon },
  });
  if (gonder.statusCode !== 200) throw new Error(`otp gonder: ${gonder.body}`);
  const kod = sms.sonKod(telefon);
  if (!kod) throw new Error('SMS kodu yakalanamadı');
  const dogrula = await service.app.inject({
    method: 'POST',
    url: '/auth/otp/dogrula',
    remoteAddress,
    payload: { telefon, kod },
  });
  if (dogrula.statusCode !== 200) throw new Error(`otp dogrula: ${dogrula.body}`);
  const govde = dogrula.json<{ oturum_belirteci: string; kullanici: { id: string } }>();
  return { telefon, oturum: govde.oturum_belirteci, kullaniciId: govde.kullanici.id };
}

export interface TokenSonucu {
  accessToken: string;
  govde: {
    kurum_id: string | null;
    uyelik_id: string | null;
    rol: string | null;
    roller: string[];
    uyelikler: { uyelik_id: string; kurum_id: string; rol: string }[];
  };
}

export async function tokenAl(
  { service }: TestServisi,
  oturum: string,
  govde: { kurum_id?: string; uyelik_id?: string } = {},
): Promise<TokenSonucu> {
  const res = await service.app.inject({
    method: 'POST',
    url: '/auth/token',
    headers: { authorization: `Bearer ${oturum}` },
    payload: govde,
  });
  if (res.statusCode !== 200) throw new Error(`token: ${res.body}`);
  const j = res.json<TokenSonucu['govde'] & { access_token: string }>();
  return { accessToken: j.access_token, govde: j };
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** Guncel KVKK metnini kabul eder. */
export async function rizaKabulEt({ service }: TestServisi, accessToken: string): Promise<void> {
  const guncel = await service.app.inject({
    url: '/v1/hesap/rizalar/guncel',
    headers: bearer(accessToken),
  });
  const metinler = guncel.json<{ metinler: { id: string; kabul_edildi: boolean }[] }>().metinler;
  for (const m of metinler.filter((x) => !x.kabul_edildi)) {
    const res = await service.app.inject({
      method: 'POST',
      url: '/v1/hesap/rizalar',
      headers: bearer(accessToken),
      payload: { riza_metni_id: m.id },
    });
    if (res.statusCode !== 200) throw new Error(`riza: ${res.body}`);
  }
}

export interface KurumluKullanici extends GirisSonucu {
  kurumId: string;
  token: string;
  uyelikId: string;
}

/** Giris + rıza + kurum olusturma + kurum bagli token. */
export async function kurumluKullanici(
  t: TestServisi,
  tur: 'bireysel' | 'ekip' | 'kurum' = 'kurum',
  ad = 'Test Kurumu',
): Promise<KurumluKullanici> {
  const giris = await otpIleGiris(t);
  const ilk = await tokenAl(t, giris.oturum);
  await rizaKabulEt(t, ilk.accessToken);
  const res = await t.service.app.inject({
    method: 'POST',
    url: '/v1/hesap/kurumlar',
    headers: bearer(ilk.accessToken),
    payload: { ad, tur },
  });
  if (res.statusCode !== 201) throw new Error(`kurum: ${res.body}`);
  const kurumId = res.json<{ kurum: { id: string } }>().kurum.id;
  const sonuc = await tokenAl(t, giris.oturum, { kurum_id: kurumId });
  return { ...giris, kurumId, token: sonuc.accessToken, uyelikId: sonuc.govde.uyelik_id ?? '' };
}

/** Reddedilen sorgunun (Drizzle sarmalayicisi dahil) tum hata zincirinin metni. */
export async function hataMetni(islem: Promise<unknown>): Promise<string> {
  try {
    await islem;
  } catch (err) {
    const parcalar: string[] = [];
    for (let e: unknown = err; e instanceof Error; e = e.cause) parcalar.push(e.message);
    return parcalar.join(' | ');
  }
  throw new Error('İşlem reddedilmeliydi');
}
