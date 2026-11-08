import postgres from 'postgres';

/** Gercek api ve veritabani adresleri; ortamdan degistirilebilir. */
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';
/** `hesap.dogrulamalar` okumak icin superuser baglantisi (yalnizca yerel test). */
export const API_ADMIN_DB_URL =
  process.env.API_ADMIN_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/api';

/** Her calistirmada benzersiz, gecerli bir cep telefonu (5XXXXXXXXX). */
export function benzersizTelefon(): string {
  const sonek = `${String(Date.now() % 10_000_000)}${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`;
  return `5${sonek.padStart(9, '0').slice(-9)}`;
}

/** Api ve veritabani erisilebilir mi? Degilse atlama nedenini dondurur. */
export async function ortamSorunu(): Promise<string | null> {
  try {
    const yanit = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (!yanit.ok) return `api ${API_URL} /health ${String(yanit.status)} dondu`;
  } catch {
    return `api ${API_URL} adresine ulasilamadi (gercek api calismiyor)`;
  }
  const sql = postgres(API_ADMIN_DB_URL, { max: 1, connect_timeout: 3 });
  try {
    await sql`select 1`;
  } catch {
    return `veritabani (${API_ADMIN_DB_URL.replace(/:[^:@/]*@/, ':***@')}) erisilemedi`;
  } finally {
    await sql.end({ timeout: 1 });
  }
  return null;
}

/**
 * Telefona gonderilen son OTP kodunu veritabanindan okur (gercek api'de sabit kod yok).
 * `deger` bicimi: `<6 hane>:<deneme sayisi>`.
 */
export async function sonOtpKodu(telefon: string): Promise<string> {
  const sql = postgres(API_ADMIN_DB_URL, { max: 1 });
  try {
    for (let i = 0; i < 20; i += 1) {
      const satirlar = await sql<{ deger: string }[]>`
        select deger from hesap.dogrulamalar
        where tanimlayici like ${`%${telefon}`} and expires_at > now()
        order by created_at desc limit 1`;
      const kod = satirlar[0]?.deger.split(':')[0];
      if (kod && /^\d{6}$/.test(kod)) return kod;
      await new Promise((coz) => setTimeout(coz, 250));
    }
    throw new Error(`OTP kodu bulunamadi (telefon ${telefon})`);
  } finally {
    await sql.end({ timeout: 1 });
  }
}

async function apiIstek<T>(yol: string, govde: unknown, belirtec?: string): Promise<T> {
  const yanit = await fetch(`${API_URL}${yol}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(belirtec ? { authorization: `Bearer ${belirtec}` } : {}),
    },
    body: JSON.stringify(govde),
  });
  if (!yanit.ok) throw new Error(`${yol} ${String(yanit.status)}: ${await yanit.text()}`);
  return (await yanit.json()) as T;
}

/**
 * Kurum olusturma arayuzde henuz yok: ayni kullanici icin ikinci bir OTP girisiyle
 * (KVKK tarayicida onaylanmis olmali) api uzerinden kurum acar. Kurum adini dondurur.
 */
export async function kurumOlustur(telefon: string, ad: string): Promise<string> {
  await apiIstek('/auth/otp/gonder', { telefon });
  const kod = await sonOtpKodu(telefon);
  const { oturum_belirteci: oturum } = await apiIstek<{ oturum_belirteci: string }>(
    '/auth/otp/dogrula',
    { telefon, kod },
  );
  const { access_token: erisim } = await apiIstek<{ access_token: string }>(
    '/auth/token',
    {},
    oturum,
  );
  await apiIstek('/v1/hesap/kurumlar', { ad, tur: 'kurum' }, erisim);
  return ad;
}
