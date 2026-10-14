import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Flat config for ESLint 9, matching apps/api and packages/shared so the quality
 * gates are uniform across the monorepo.
 *
 * Unlike the API and shared packages this config does not enable the type-aware
 * rules. In JSX, passing an async function to an event handler (`onClick`) is
 * normal and correct, and `no-misused-promises` cannot tell that apart from the
 * un-awaited call it exists to catch; enabling it here would mean a rule
 * suppression on every handler. The type checker, not ESLint, is what proves the
 * dashboard's promises are sound.
 */
export default tseslint.config(
  {
    ignores: ['**/.next/**', '**/node_modules/**', 'next-env.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      // TypeScript already reports undefined identifiers, and it knows the DOM
      // globals that the base JS rule does not.
      'no-undef': 'off',
    },
  },
  // Must stay last: turns off anything that conflicts with Prettier.
  prettier,
);
