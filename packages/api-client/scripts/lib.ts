import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import openapiTS, { astToString, type OpenAPI3 } from 'openapi-typescript';

export const servisler = ['api', 'motivasyon', 'bildirim', 'medya'] as const;
export type Servis = (typeof servisler)[number];

const kok = new URL('../', import.meta.url);

export const yol = {
  anlik: (s: Servis) => fileURLToPath(new URL(`openapi/${s}.json`, kok)),
  tip: (s: Servis) => fileURLToPath(new URL(`src/generated/${s}.ts`, kok)),
};

/** Anahtarlari siralayarak ayni girdiden her zaman ayni JSON'u uretir. */
function siralaDerin(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(siralaDerin);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, siralaDerin(v)]),
    );
  }
  return value;
}

interface ServisUygulamasi {
  buildService(env: unknown): {
    app: { ready(): PromiseLike<unknown>; swagger(): unknown };
    stop(): Promise<void>;
  };
}
interface ServisAyari {
  loadServiceEnv(source: Record<string, string | undefined>): unknown;
}

/**
 * Servisin Fastify uygulamasini ag ve veritabani olmadan, bellek icinde ayaga kaldirir
 * ve OpenAPI belgesini alir. DATABASE_URL / NATS_URL verilmedigi icin hicbir baglanti acilmaz.
 */
export async function openapiAl(servis: Servis): Promise<string> {
  const app = (await import(`../../../services/${servis}/src/app.ts`)) as ServisUygulamasi;
  const config = (await import(`../../../services/${servis}/src/config.ts`)) as ServisAyari;
  const service = app.buildService(
    config.loadServiceEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', AUTH_ENABLED: 'false' }),
  );
  try {
    await service.app.ready();
    return `${JSON.stringify(siralaDerin(service.app.swagger()), null, 2)}\n`;
  } finally {
    await service.stop();
  }
}

const baslik = (servis: Servis) =>
  `/**\n * Uretilmis dosya: \`pnpm --filter @kopru/api-client generate\` ile ${servis} servisinin\n * OpenAPI anliginden (openapi/${servis}.json) uretilir. Elle degistirmeyin.\n */\n\n`;

export async function tipUret(servis: Servis, anlik: string): Promise<string> {
  const ast = await openapiTS(JSON.parse(anlik) as OpenAPI3, { alphabetize: true });
  return baslik(servis) + astToString(ast);
}

export async function anlikOku(servis: Servis): Promise<string> {
  return readFile(yol.anlik(servis), 'utf8');
}

/** Servislerin guncel anligi ve bunlardan uretilen tipler. */
export async function hepsiniUret(): Promise<Map<string, string>> {
  const cikti = new Map<string, string>();
  for (const servis of servisler) {
    const anlik = await openapiAl(servis);
    cikti.set(yol.anlik(servis), anlik);
    cikti.set(yol.tip(servis), await tipUret(servis, anlik));
  }
  return cikti;
}
