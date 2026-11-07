import { defineVitestConfig } from '@kopru/config/vitest';

export default defineVitestConfig({
  test: { globalSetup: ['./src/test/global-setup.ts'] },
});
