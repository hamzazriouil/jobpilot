import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // each file boots its own in-process Postgres (PGlite, WASM)
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
