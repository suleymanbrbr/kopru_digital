/**
 * Tarayicidan BFF'e (`/api/*`) tipli istek. Tum belirtecler httpOnly cerezdedir; burada hicbiri yoktur.
 */

export interface AlanHatasi {
  alan: string;
  mesaj: string;
}

/** BFF/api standart hata govdesinden uretilen hata. */
export class YonetimHatasi extends Error {
  constructor(
    public readonly durum: number,
    public readonly kod: string,
    mesaj: string,
    public readonly ayrintilar?: unknown,
    public readonly istekId?: string,
  ) {
    super(mesaj);
    this.name = 'YonetimHatasi';
  }

  /**
   * Alan bazli hatalar: motivasyon `details.hatalar[{alan,mesaj}]`, Fastify dogrulamasi
   * `details[{path,message}]`.
   */
  get alanHatalari(): AlanHatasi[] {
    const d = this.ayrintilar;
    const dizi = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
    const liste =
      typeof d === 'object' && d !== null && !Array.isArray(d)
        ? dizi((d as { hatalar?: unknown }).hatalar)
        : dizi(d);
    const sonuc: AlanHatasi[] = [];
    for (const o of liste) {
      if (typeof o !== 'object' || o === null) continue;
      const r = o as Record<string, unknown>;
      const alan = typeof r.alan === 'string' ? r.alan : typeof r.path === 'string' ? r.path : '';
      const mesaj =
        typeof r.mesaj === 'string' ? r.mesaj : typeof r.message === 'string' ? r.message : '';
      if (alan || mesaj) sonuc.push({ alan, mesaj });
    }
    return sonuc;
  }
}

function hataUret(durum: number, govde: unknown): YonetimHatasi {
  const e =
    typeof govde === 'object' && govde !== null && 'error' in govde
      ? (govde as { error?: Record<string, unknown> }).error
      : undefined;
  const kod = typeof e?.code === 'string' ? e.code : durum === 401 ? 'yetkisiz' : 'sunucu_hatasi';
  const mesaj = typeof e?.message === 'string' ? e.message : 'İstek başarısız.';
  return new YonetimHatasi(
    durum,
    kod,
    mesaj,
    e?.details,
    typeof e?.requestId === 'string' ? e.requestId : undefined,
  );
}

export type Sorgu = Record<string, string | number | undefined | null>;

export function sorguMetni(sorgu?: Sorgu): string {
  if (!sorgu) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sorgu)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function istek<T>(
  yontem: 'GET' | 'POST' | 'PUT',
  adres: string,
  govde?: unknown,
): Promise<T> {
  const baslangic: RequestInit = { method: yontem, credentials: 'same-origin', cache: 'no-store' };
  if (yontem !== 'GET') {
    baslangic.headers = { 'content-type': 'application/json' };
    baslangic.body = JSON.stringify(govde ?? {});
  }
  let yanit: Response;
  try {
    yanit = await fetch(adres, baslangic);
  } catch {
    throw new YonetimHatasi(0, 'hizmet_kullanilamiyor', 'Sunucuya ulaşılamadı.');
  }
  const metin = await yanit.text();
  let ayrisan: unknown;
  try {
    ayrisan = metin ? (JSON.parse(metin) as unknown) : undefined;
  } catch {
    ayrisan = undefined;
  }
  if (!yanit.ok) throw hataUret(yanit.status, ayrisan);
  return ayrisan as T;
}

/** `/api/platform/<yol>` */
export const platform = {
  al: <T>(yol: string, sorgu?: Sorgu) =>
    istek<T>('GET', `/api/platform/${yol}${sorguMetni(sorgu)}`),
  yolla: <T>(yol: string, govde?: unknown) => istek<T>('POST', `/api/platform/${yol}`, govde),
  koy: <T>(yol: string, govde?: unknown) => istek<T>('PUT', `/api/platform/${yol}`, govde),
};

/** BFF'in kendi uclari (`/api/oturum/*`, `/api/taklit/*`). */
export const bff = {
  al: <T>(yol: string) => istek<T>('GET', `/api/${yol}`),
  yolla: <T>(yol: string, govde?: unknown) => istek<T>('POST', `/api/${yol}`, govde),
};
