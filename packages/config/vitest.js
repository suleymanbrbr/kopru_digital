import { defineConfig, mergeConfig } from 'vitest/config';

/** Tum paketlerin kullandigi temel Vitest ayari. */
export const baseVitestConfig = defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});

/** @param {import('vitest/config').ViteUserConfig} [overrides] */
export function defineVitestConfig(overrides = {}) {
  return mergeConfig(baseVitestConfig, overrides);
}
