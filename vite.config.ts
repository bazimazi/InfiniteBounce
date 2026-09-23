import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: false },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
