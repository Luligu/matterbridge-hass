// vitest.config.ts 2.0.9

// This Vitest configuration is designed for a TypeScript project.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: '.cache/vitest',
  envDir: false,
  test: {
    include: ['**/vitest/**/*.{spec,test}.{ts,mts,cts}'],
    exclude: ['**/.cache/', '**/build/', '**/coverage/', '**/dist/', '**/node_modules/', '**/out/', '**/screenshots/', '**/scripts/', '**/temp/', '**/tmp/'],
    globals: true,
    clearMocks: false,
    restoreMocks: false,
    environment: 'node',
    maxWorkers: '100%',
    reporters: ['default', 'junit'],
    outputFile: { junit: '.cache/vitest/junit.xml' },
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage/vitest',
      reporter: ['lcov', 'text', 'json'],
      include: ['**/src/**/*.{ts,mts,cts}'],
      exclude: ['**/.cache/', '**/build/', '**/coverage/', '**/dist/', '**/node_modules/', '**/out/', '**/screenshots/', '**/scripts/', '**/temp/', '**/tmp/'],
    },
  },
});
