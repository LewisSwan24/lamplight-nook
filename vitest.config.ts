import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['tests/temp-root.ts'],
    setupFiles: ['tests/yield.ts'],
  },
});
