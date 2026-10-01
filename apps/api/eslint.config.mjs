import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Flat config for ESLint 9.
 *
 * The `lint` script previously referenced ESLint without it being installed,
 * so `npm run lint` failed for everyone. It is now a real dependency.
 */
export default tseslint.config(
  {
    // Generated Prisma client output is not ours to lint.
    ignores: ['**/dist/**', '**/node_modules/**', '**/src/generated/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        // Tests are excluded from tsconfig.json (the build must not compile
        // them), so they need a project that includes them or every type-aware
        // rule fails to parse.
        project: ['./tsconfig.json', './tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Unused arguments prefixed with `_` are the deliberate "required by the
      // interface, not used here" case, e.g. pipe signatures.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // An `any` defeats the point of the typed Prisma client, so it has to be
      // justified rather than slipped in.
      '@typescript-eslint/no-explicit-any': 'error',
      // Floating promises are a real bug class in Nest: an un-awaited async
      // service call fails silently.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Prisma tooling and config files run outside the app's module graph.
    files: ['prisma.config.ts', '**/*.config.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // Must stay last: turns off anything that conflicts with Prettier.
  prettier,
);
