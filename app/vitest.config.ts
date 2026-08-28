import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Deliberately separate from vite.config.ts: the PWA plugin has no business
// running inside the unit test pipeline (service worker generation, manifest
// injection) and Tailwind processing is irrelevant to component logic tests.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
