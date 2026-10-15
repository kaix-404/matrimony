import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Flat config for ESLint 9, matching apps/api, apps/admin and packages/shared so
 * the quality gates are uniform across the monorepo.
 *
 * Type-aware rules are intentionally left off: React Native components pass
 * async functions to event handlers (`onPress`) as a matter of course, and
 * `no-misused-promises` cannot distinguish those from an un-awaited call. The
 * type checker proves the app's promises are sound instead.
 */
export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/.expo/**', '**/dist/**', '**/ios/**', '**/android/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      // TypeScript already reports undefined identifiers and knows the RN/DOM
      // globals the base JS rule does not.
      'no-undef': 'off',
    },
  },
  // Must stay last: turns off anything that conflicts with Prettier.
  prettier,
);