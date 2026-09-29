/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'CommonJS', target: 'ES2022' } }],
  },
  // Sources use NodeNext-style './foo.js' specifiers; map them back to the
  // TypeScript files so CommonJS resolution under ts-jest can find them.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['**/*.ts', '!**/*.test.ts', '!**/generated/**'],
  coverageDirectory: 'coverage',
};
