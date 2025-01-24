/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/v3/**/*.test.ts'],
    typecheck: {
      enabled: true,
      include: ['src/v3/**/*.test-d.ts'],
      ignoreSourceErrors: true,
    },
  },
})
