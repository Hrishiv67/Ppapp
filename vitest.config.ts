import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@': root },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    // End-to-end engine tests synthesize and analyze minutes of audio.
    testTimeout: 60_000,
  },
});
