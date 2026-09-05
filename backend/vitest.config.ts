import { defineConfig } from 'vitest/config';

// Unit tests only for now: no database, no network. Anything needing Postgres
// is verified through the stage checkpoints instead (see the build plan).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: 'default',
  },
});
