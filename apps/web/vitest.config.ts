import { defineConfig } from 'vitest/config';

// Unit tests for pure client/server helpers only (no DOM, no React rendering).
export default defineConfig({ test: { include: ['lib/**/*.test.ts'] } });
