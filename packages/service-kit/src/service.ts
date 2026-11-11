import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type RawReplyDefaultExpression,
  type RawRequestDefaultExpression,
  type RawServerDefault,
} from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type FastifyPluginAsyncZod,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { connect, type NatsConnection } from 'nats';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import { createJwtVerifier, installAuth, type VerifyJwt } from './auth.js';
import { checkDb, createDb, type Database } from './db.js';
import type { BaseEnv } from './env.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { BellekIptalDeposu, NatsIptalDeposu, type IptalDeposu } from './iptal.js';
import { createLogger } from './logger.js';
import { createServisJwtVerifier, installServisAuth, type VerifyServisJwt } from './servis-auth.js';
import { installShutdownHandlers } from './shutdown.js';

export type ServiceApp = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  ZodTypeProvider
>;

/** Servis (veya api modulu) plugin'i; zod tip saglayicisi hazir gelir. */
export type ServicePlugin = FastifyPluginAsyncZod;

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
  }
  interface FastifyInstance {
    /** `DATABASE_URL` tanimli degilse null. */
    db: Database | null;
    /** `NATS_URL` tanimliysa ve start() sonrasi baglanti; aksi halde null. */
    nats: NatsConnection | null;
    /** Iptal edilmis oturumlar (`sid`, ADR 0008): NATS varsa KV, yoksa surec ici. */
    iptal: IptalDeposu;
  }
}

export type ReadinessCheck = () => Promise<void>;

export interface CreateServiceOptions {
  name: string;
  port: number;
  env: BaseEnv;
  plugins?: ServicePlugin[];
  version?: string;
  /** Ek /ready kontrolleri (DB ve NATS otomatik eklenir). */
  readinessChecks?: Record<string, ReadinessCheck>;
  /** Auth dogrulayici; verilmezse `JWKS_URL` kullanilir. */
  verifyJwt?: VerifyJwt;
  /**
   * `/ic/*` (`config.servisScope`) rotalari icin servis JWT dogrulayici; verilmezse `JWKS_URL` ve
   * `aud = name` ile olusturulur. api kendi anahtarlariyla yerinde dogrulama icin verir.
   */
  verifyServisJwt?: VerifyServisJwt;
  /** Iptal listesi; verilmezse `NATS_URL` varsa NATS KV, yoksa surec ici depo. */
  iptalDeposu?: IptalDeposu;
  /** Kapanista (db/nats kapandiktan sonra) calisir; ornek: telemetry.shutdown */
  onClose?: () => Promise<void>;
}

export interface Service {
  app: ServiceApp;
  /** NATS'a baglanir, dinlemeye baslar ve SIGTERM/SIGINT dinleyicilerini kurar. */
  start(): Promise<string>;
  stop(): Promise<void>;
}

const READY_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`zaman aşımı (${String(ms)}ms)`));
    }, ms);
    promise.then(resolve, reject).finally(() => {
      clearTimeout(timer);
    });
  });
}

const headerValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export function createService(options: CreateServiceOptions): Service {
  const { name, env } = options;
  const logger: FastifyBaseLogger = createLogger(name, env);

  const app: ServiceApp = Fastify({
    loggerInstance: logger,
    requestIdHeader: false,
    // ADR 0009: yalniz acik IP/CIDR listesindeki proxy'lerin X-Forwarded-For'una guvenilir;
    // bos liste = baslik yok sayilir (`true`/`*` env semasinda reddedilir).
    trustProxy: env.TRUST_PROXY.length > 0 ? env.TRUST_PROXY : false,
    genReqId: (request) => headerValue(request.headers['x-request-id']) ?? uuidv7(),
    // correlationId tum istek loglarinda (gelen/biten istek dahil) gorunsun.
    childLoggerFactory: (log, bindings, options, request) => {
      const reqId: unknown = bindings.reqId;
      return log.child(
        {
          ...bindings,
          correlationId: headerValue(request.headers['x-correlation-id']) ?? reqId,
        },
        options,
      );
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  // --- Kaynaklar -----------------------------------------------------------
  const db = env.DATABASE_URL
    ? createDb({ url: env.DATABASE_URL, max: env.DATABASE_POOL_MAX })
    : null;
  let natsConnection: NatsConnection | null = null;

  app.decorate('db', db);
  app.decorate('nats', { getter: () => natsConnection });
  const iptal: IptalDeposu =
    options.iptalDeposu ??
    (env.NATS_URL
      ? new NatsIptalDeposu(() => natsConnection, { log: logger })
      : new BellekIptalDeposu());
  app.decorate('iptal', iptal);
  app.decorateRequest('correlationId', '');

  const checks: Record<string, ReadinessCheck> = { ...options.readinessChecks };
  if (db) checks.db = () => checkDb(db);
  if (env.NATS_URL) {
    checks.nats = async () => {
      if (!natsConnection || natsConnection.isClosed()) throw new Error('NATS bağlantısı yok');
      await natsConnection.flush();
    };
  }

  // --- Istek kimlikleri ------------------------------------------------------
  app.addHook('onRequest', async (request, reply) => {
    request.correlationId = headerValue(request.headers['x-correlation-id']) ?? request.id;
    void reply.header('x-request-id', request.id);
    void reply.header('x-correlation-id', request.correlationId);
  });

  // --- Eklentiler ----------------------------------------------------------
  const openapiEnabled = env.OPENAPI_ENABLED ?? env.NODE_ENV !== 'production';

  app.register(swagger, {
    openapi: { info: { title: name, version: options.version ?? '0.0.0' } },
    transform: jsonSchemaTransform,
  });
  app.register(cors, { origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false });
  app.register(rateLimit, { max: env.RATE_LIMIT_MAX, timeWindow: '1 minute' });

  installAuth(app, {
    enabled: env.AUTH_ENABLED,
    iptal,
    verify:
      options.verifyJwt ??
      (env.AUTH_ENABLED
        ? createJwtVerifier({
            ...(env.JWKS_URL ? { jwksUrl: env.JWKS_URL } : {}),
            ...(env.JWT_ISSUER ? { issuer: env.JWT_ISSUER } : {}),
            ...(env.JWT_AUDIENCE ? { audience: env.JWT_AUDIENCE } : {}),
          })
        : undefined),
  });

  installServisAuth(app, {
    enabled: env.AUTH_ENABLED,
    verify:
      options.verifyServisJwt ??
      (env.AUTH_ENABLED
        ? createServisJwtVerifier({
            ...(env.JWKS_URL ? { jwksUrl: env.JWKS_URL } : {}),
            ...(env.JWT_ISSUER ? { issuer: env.JWT_ISSUER } : {}),
            audience: name,
          })
        : undefined),
  });

  // --- Standart rotalar ------------------------------------------------------
  const publicRoute = { public: true, rateLimit: false } as const;

  app.get('/health', { config: publicRoute, schema: { hide: true } }, () => ({ status: 'ok' }));

  app.get(
    '/ready',
    {
      config: publicRoute,
      schema: {
        hide: true,
        response: {
          200: z.object({ status: z.literal('ready'), checks: z.record(z.string(), z.string()) }),
          503: z.object({
            status: z.literal('not_ready'),
            checks: z.record(z.string(), z.string()),
          }),
        },
      },
    },
    async (request, reply) => {
      const results: Record<string, string> = {};
      await Promise.all(
        Object.entries(checks).map(async ([check, run]) => {
          try {
            await withTimeout(run(), READY_TIMEOUT_MS);
            results[check] = 'ok';
          } catch (err) {
            request.log.warn({ err, check }, 'hazırlık kontrolü başarısız');
            results[check] = 'hata';
          }
        }),
      );
      const ready = Object.values(results).every((result) => result === 'ok');
      return reply
        .status(ready ? 200 : 503)
        .send(
          ready ? { status: 'ready', checks: results } : { status: 'not_ready', checks: results },
        );
    },
  );

  if (openapiEnabled) {
    app.get('/openapi.json', { config: publicRoute, schema: { hide: true } }, () => app.swagger());
  }

  for (const plugin of options.plugins ?? []) {
    app.register(plugin);
  }

  // --- Yasam dongusu -------------------------------------------------------
  app.addHook('onClose', async () => {
    if (natsConnection && !natsConnection.isClosed()) await natsConnection.drain();
    await db?.close();
    await options.onClose?.();
  });

  let removeSignalHandlers: (() => void) | undefined;
  let stopping: Promise<void> | undefined;

  const stop = () => {
    stopping ??= app.close();
    removeSignalHandlers?.();
    return stopping;
  };

  return {
    app,
    stop,
    async start() {
      if (env.NATS_URL) {
        natsConnection = await connect({ servers: env.NATS_URL, name });
      }
      const address = await app.listen({ host: env.HOST, port: options.port });
      removeSignalHandlers = installShutdownHandlers(stop, app.log);
      return address;
    },
  };
}
