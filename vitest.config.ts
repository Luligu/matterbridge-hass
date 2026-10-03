// vitest.config.ts 2.0.8

// This Vitest configuration is designed for a TypeScript project.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: '.cache/vitest',
  envDir: false,
  test: {
    include: ['**/vitest/**/*.{spec,test}.{ts,mts,cts}'],
    exclude: [
      '**/.cache/',
      '**/apps/',
      '**/build/',
      '**/chip/',
      '**/coverage/',
      '**/dist/',
      '**/node_modules/',
      '**/out/',
      '**/screenshots/',
      '**/scripts/',
      '**/src/mock/',
      '**/temp/',
      '**/tmp/',
      '**/template/',
    ],
    globals: true,
    clearMocks: false,
    restoreMocks: false,
    environment: 'node',
    maxWorkers: '100%',
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage/vitest',
      reporter: ['lcov', 'text', 'json'],
      include: ['**/src/**/*.{ts,mts,cts}'],
      exclude: [
        '**/.cache/',
        '**/apps/',
        '**/build/',
        '**/chip/',
        '**/coverage/',
        '**/dist/',
        '**/node_modules/',
        '**/out/',
        '**/screenshots/',
        '**/scripts/',
        '**/src/mock/',
        '**/src/**/*.d.ts',
        '**/temp/',
        '**/tmp/',
        '**/template/',
        '**/vitest/**',
      ],
    },
  },
});
