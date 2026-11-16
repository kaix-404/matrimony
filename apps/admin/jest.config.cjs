/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  // The pure helpers under lib/, plus the session route handlers: their answer
  // decides whether an API outage reaches an operator as a broken console.
  // Server components are still exercised through `next build` and a real API.
  testMatch: ['<rootDir>/lib/**/*.test.ts', '<rootDir>/app/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'CommonJS', target: 'ES2022', esModuleInterop: true } }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@matrimony/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@matrimony/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  coverageDirectory: 'coverage',
};
