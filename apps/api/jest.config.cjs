/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'CommonJS', target: 'ES2022', experimentalDecorators: true, emitDecoratorMetadata: true } }],
  },
  moduleNameMapper: {
    '^@matrimony/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
    '^@matrimony/shared/(.*)$': '<rootDir>/../../../packages/shared/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['**/*.ts', '!**/*.test.ts', '!**/generated/**'],
  coverageDirectory: 'coverage',
};
