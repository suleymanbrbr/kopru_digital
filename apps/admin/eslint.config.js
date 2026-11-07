import { createConfig } from '@kopru/config/eslint';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['.next/**', 'next-env.d.ts'] },
  ...createConfig({ rootDir: import.meta.dirname }),
  {
    name: 'kopru/admin',
    files: ['**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
];
