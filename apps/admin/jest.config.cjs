/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  // Only the pure helpers under lib/ are unit tested. React server components
  // and route handlers are exercised through `next build` and a real API, not by
  // a JSX test renderer.
  testMatch: ['<rootDir>/lib/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'CommonJS', target: 'ES2022', esModuleInterop: true } }],
  },
  moduleNameMapper: {
    '^@matrimony/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@matrimony/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  coverageDirectory: 'coverage',
};
