import { createDb, withTenant, type Database, type Tx } from '@kopru/service-kit';
import postgres from 'postgres';
import { uuidv7 } from 'uuidv7';

import { testDb } from './yardimcilar.js';

/** Sabit "simdi": 10 Kasim 2026 Sali 12:00 Istanbul (09:00Z): sessiz saat disi. */
export const T0 = new Date('2026-11-10T09:00:00.000Z');
export const dk = (taban: Date, dakika: number) => new Date(taban.getTime() + dakika * 60_000);
export const saat = (taban: Date, s: number) => new Date(taban.getTime() + s * 3_600_000);
/** 10 Kasim 2026 23:30 Istanbul (20:30Z): sessiz saatin icinde. */
export const GECE = new Date('2026-11-10T20:30:00.000Z');

export interface Ortam {
  app: Database;
  sistem: postgres.Sql;
  owner: postgres.Sql;
  /** Kurum baglaminda (olay tuketicisi gibi) `bildirim_app` islemi. */
  isle<T>(kurumId: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
  kapat(): Promise<void>;
}

export function ortamKur(): Ortam {
  const urls = testDb();
  if (!urls) throw new Error('testDb yok');
  const app = createDb({ url: urls.appUrl, max: 4 });
  const sistem = postgres(urls.sistemUrl, { max: 2, onnotice: () => undefined });
  const owner = postgres(urls.ownerUrl, { max: 1, onnotice: () => undefined });
  return {
    app,
    sistem,
    owner,
    isle: (kurumId, fn) => withTenant(app, { kurumId }, fn),
    kapat: async () => {
      await app.close();
      await sistem.end();
      await owner.end();
    },
  };
}

export interface Alici {
  kurumId: string;
  uyelikId: string;
  kullaniciId: string;
}

/** Kurum kopyasi (yoksa) ve etkin uyelik kopyasi yazar (sistem rolu, RLS disi). */
export async function aliciKur(
  o: Ortam,
  s: { kurumId?: string; rol?: string; durum?: string; kurumDurum?: string } = {},
): Promise<Alici> {
  const kurumId = s.kurumId ?? uuidv7();
  const uyelikId = uuidv7();
  const kullaniciId = uuidv7();
  await o.sistem`insert into bildirim.kurum_kopyalari (kurum_id, ad, durum, saat_dilimi, son_olay_at, son_olay_id)
                 values (${kurumId}, 'Kurum', ${s.kurumDurum ?? 'aktif'}, 'Europe/Istanbul', now(), ${uuidv7()})
                 on conflict (kurum_id) do nothing`;
  await o.sistem`insert into bildirim.uyelik_kopyalari (uyelik_id, kurum_id, kullanici_id, rol, durum, son_olay_at, son_olay_id)
                 values (${uyelikId}, ${kurumId}, ${kullaniciId}, ${s.rol ?? 'ogrenci'}, ${s.durum ?? 'aktif'}, now(), ${uuidv7()})`;
  return { kurumId, uyelikId, kullaniciId };
}

/** Etkin cihaz ekler; cihaz kimligini doner. */
export async function cihazEkle(
  o: Ortam,
  kullaniciId: string,
  s: { platform?: 'ios' | 'android'; belirtec?: string } = {},
): Promise<{ id: string; belirtec: string }> {
  const id = uuidv7();
  const belirtec = s.belirtec ?? `ExponentPushToken[${uuidv7()}]`;
  await o.sistem`insert into bildirim.cihazlar (id, kullanici_id, platform, push_belirteci, cihaz_kimligi)
                 values (${id}, ${kullaniciId}, ${s.platform ?? 'android'}, ${belirtec}, ${uuidv7()})`;
  return { id, belirtec };
}
