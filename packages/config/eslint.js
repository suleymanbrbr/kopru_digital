import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import importX from 'eslint-plugin-import-x';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** @param {string} dir */
function listDirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules',
    )
    .map((entry) => entry.name);
}

/**
 * Bagimlilik siniri kurallari. Servis ve modul listesi dosya sisteminden okunur;
 * yeni servis/modul eklenince kural listesini elle guncellemek gerekmez.
 *
 *  1. Bir servis baska bir servisi iceri alamaz (iletisim yalnizca NATS olaylari ve HTTP).
 *  2. packages/* hicbir servise bagimli olamaz.
 *  3. api modulleri birbirinin ic dosyalarina erisemez; yalnizca `index.ts` uzerinden.
 *
 * @param {string} rootDir
 */
export function boundaryConfigs(rootDir) {
  const services = listDirs(join(rootDir, 'services'));
  const modules = listDirs(join(rootDir, 'services/api/src/modules'));

  /** @param {string[]} targets */
  const serviceGroup = (targets) => ({
    group: targets.flatMap((s) => [`@kopru/${s}`, `@kopru/${s}/**`, `**/${s}/src/**`]),
    message:
      'Servisler birbirini import edemez. Iletisim icin NATS olaylari (@kopru/contracts) veya HTTP kullanin.',
  });

  /** @param {string[]} patterns */
  const rule = (...patterns) => ['error', { patterns }];

  const configs = [
    {
      name: 'kopru/boundaries/packages',
      files: ['packages/*/src/**/*.ts', 'packages/*/*.ts'],
      rules: {
        'no-restricted-imports': rule({
          group: [...services.flatMap((s) => [`@kopru/${s}`, `@kopru/${s}/**`]), '**/services/**'],
          message: 'packages/* servislere bagimli olamaz.',
        }),
      },
    },
  ];

  for (const service of services) {
    const others = services.filter((s) => s !== service);
    if (service !== 'api') {
      configs.push({
        name: `kopru/boundaries/${service}`,
        files: [`services/${service}/**/*.ts`],
        rules: { 'no-restricted-imports': rule(serviceGroup(others)) },
      });
      continue;
    }

    const moduleMessage =
      'Bir api modulu baska modulun ic dosyalarina erisemez; yalnizca modulun index.ts dosyasini kullanin.';

    configs.push(
      {
        name: 'kopru/boundaries/api',
        files: ['services/api/**/*.ts'],
        ignores: ['services/api/src/modules/**'],
        rules: {
          'no-restricted-imports': rule(serviceGroup(others), {
            group: ['**/modules/*/**', '!**/modules/*/index.js'],
            message: moduleMessage,
          }),
        },
      },
      {
        name: 'kopru/boundaries/api/modules-root',
        files: ['services/api/src/modules/*.ts'],
        rules: {
          'no-restricted-imports': rule(serviceGroup(others), {
            group: ['./*/**', '!./*/index.js'],
            message: moduleMessage,
          }),
        },
      },
    );

    for (const mod of modules) {
      const otherModules = modules.filter((m) => m !== mod);
      configs.push({
        name: `kopru/boundaries/api/modules/${mod}`,
        files: [`services/api/src/modules/${mod}/**/*.ts`],
        rules: {
          'no-restricted-imports': rule(
            serviceGroup(others),
            ...otherModules.map((other) => ({
              group: [
                `**/modules/${other}/**`,
                `../${other}/**`,
                `!**/modules/${other}/index.js`,
                `!../${other}/index.js`,
              ],
              message: moduleMessage,
            })),
          ),
        },
      });
    }
  }

  return configs;
}

/**
 * ADR 0003: `withSistem()` (BYPASSRLS) yalnizca `services/<servis>/src/sistem/**` altindan cagrilir.
 * Diger kodlar, o dizindeki adlandirilmis sistem islemlerini kullanir. Test dosyalari muaftir;
 * service-kit `withSistem` barindirmaz. Yeni servisler glob ile otomatik kapsanir.
 */
export function sistemSiniriConfig() {
  const message =
    'withSistem() yalnizca services/*/src/sistem/** altindan cagrilabilir (ADR 0003). Sistem islemini oradaki adlandirilmis bir fonksiyon olarak ekleyin.';
  return {
    name: 'kopru/sistem-siniri',
    files: ['services/*/src/**/*.ts'],
    ignores: ['services/*/src/sistem/**', '**/*.test.ts', 'services/*/src/test/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "ImportSpecifier[imported.name='withSistem']", message },
        { selector: 'ImportDeclaration[source.value=/with-sistem/]', message },
        { selector: "CallExpression[callee.name='withSistem']", message },
      ],
    },
  };
}

/**
 * @param {{ rootDir: string }} options  rootDir: monorepo koku (eslint.config.js'in dizini)
 */
export function createConfig({ rootDir }) {
  return defineConfig(
    {
      name: 'kopru/ignores',
      ignores: [
        '**/dist/**',
        '**/coverage/**',
        '**/.turbo/**',
        '**/node_modules/**',
        'docs/**',
        'assets/**',
        'infra/**',
      ],
    },
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
      name: 'kopru/base',
      languageOptions: {
        globals: globals.node,
        parserOptions: { projectService: true, tsconfigRootDir: rootDir },
      },
      plugins: { 'import-x': importX },
      rules: {
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': 'error',
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/restrict-template-expressions': [
          'error',
          { allowNumber: true, allowBoolean: true },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        'import-x/no-duplicates': 'error',
        'import-x/order': [
          'error',
          {
            groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
            'newlines-between': 'always',
            alphabetize: { order: 'asc', caseInsensitive: true },
          },
        ],
      },
    },
    {
      name: 'kopru/js-no-types',
      files: ['**/*.{js,mjs,cjs}'],
      extends: [tseslint.configs.disableTypeChecked],
    },
    ...boundaryConfigs(rootDir),
    sistemSiniriConfig(),
  );
}
