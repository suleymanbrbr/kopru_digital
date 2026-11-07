import { afterAll, describe, expect, it } from 'vitest';

import { buildService } from './app.js';
import { loadServiceEnv, serviceName } from './config.js';

const service = buildService(loadServiceEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }));

afterAll(() => service.stop());

describe(`${serviceName} /health`, () => {
  it('200 doner', async () => {
    const res = await service.app.inject({ url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('/ready bagimlilik tanimli degilse hazirdir', async () => {
    const res = await service.app.inject({ url: '/ready' });
    expect(res.statusCode).toBe(200);
  });
});
