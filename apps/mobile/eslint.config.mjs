import { createConfig } from '@kopru/config/eslint';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default defineConfig(
  {
    ignores: ['.expo/**', 'ios/**', 'android/**', 'dist/**', 'src/karakter/gorseller.generated.ts'],
  },
  ...createConfig({ rootDir: import.meta.dirname }),
  {
    name: 'kopru/mobile',
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, __DEV__: 'readonly' } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // RN/Expo: sema ve platform bazli dinamik require/asset kullanimi
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/services/**',
                '@kopru/api',
                '@kopru/motivasyon',
                '@kopru/bildirim',
                '@kopru/medya',
              ],
              message:
                'Mobil uygulama servisleri dogrudan import edemez; packages/api-client kullanin.',
            },
          ],
        },
      ],
    },
  },
  {
    name: 'kopru/mobile/config-files',
    files: ['*.js', '*.cjs'],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
