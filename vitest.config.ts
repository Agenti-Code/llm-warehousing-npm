import { defineConfig } from 'vitest/config';

export default defineConfig({
  projects: [
    {
      test: {
        name: 'node',
        environment: 'node',
        include: ['tests/node/**/*.test.ts'],
        globals: true
      }
    },
    {
      test: {
        name: 'browser',
        environment: 'jsdom',
        include: ['tests/browser/**/*.test.ts'],
        globals: true
      }
    },
    {
      test: {
        name: 'edge',
        environment: 'node',
        include: ['tests/edge/**/*.test.ts'],
        globals: true
      }
    }
  ]
});


