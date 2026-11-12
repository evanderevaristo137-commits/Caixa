import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * The code checker (npm run lint), run by the CI before publishing. TypeScript already checks types;
 * this catches the mistakes it cannot see, above all the rules of React hooks (a hook after an early
 * return, an effect that does not list what it reads).
 */
export default defineConfig([
  // Built files, test reports and the service worker script (plain JavaScript for the browser).
  globalIgnores(['dist', 'dev-dist', 'test-results', 'playwright-report', 'public']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // Unused names are already errors in TypeScript (noUnusedLocals); `_name` marks one kept on purpose.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
]);
