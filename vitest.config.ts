import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/src/**/*.{test,spec}.ts'],
  },
});
