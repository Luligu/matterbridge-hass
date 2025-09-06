// jest.config.js

// This Jest configuration is designed for a TypeScript project using ESM modules with ts-jest.

import { createDefaultEsmPreset } from 'ts-jest';

const presetConfig = createDefaultEsmPreset({
  tsconfig: './tsconfig.jest.json',
});

const jestConfig = {
  ...presetConfig,
  testEnvironment: 'node',
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' }, // Handle ESM imports by removing the .js extension
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/vitest/', 'jestHelpers.ts'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/', '/vitest/', 'jestHelpers.ts'],
  maxWorkers: '100%',
};

export default jestConfig;
