export interface MockYanit {
  durum: number;
  govde?: unknown;
}

export function hata(durum: number, kod: string, mesaj: string, ayrintilar?: unknown): MockYanit {
  return {
    durum,
    govde: {
      error: {
        code: kod,
        message: mesaj,
        ...(ayrintilar === undefined ? {} : { details: ayrintilar }),
      },
    },
  };
}

export function nesne(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uuidMi = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** Istek govdesindeki alan dogrulama hatasi (400 `dogrulama_hatasi`, Fastify bicimi). */
export function dogrulamaHatasi(...alanlar: { path: string; message: string }[]): MockYanit {
  return hata(400, 'dogrulama_hatasi', 'İstek doğrulanamadı.', alanlar);
}
