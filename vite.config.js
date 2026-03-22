/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['favicon.svg', 'robots.txt', 'icon-192.png', 'icon-512.png'],
    manifest: {
      name: 'Varun Ragunathan — Staff Engineer',
      short_name: 'Varun R.',
      description: 'Staff Software Engineer — Identity, Authentication, Architecture',
      theme_color: '#08080c',
      background_color: '#08080c',
      display: 'standalone',
      scope: '/',
      start_url: '/',
      icons: [{
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png'
      }, {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png'
      }, {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }]
    },
    workbox: {
      // 4 MiB — allows Storybook's sb-manager/globals-runtime.js (3.18 MB)
      // to be processed without error when build-storybook shares this config.
      // Main app assets are all well under 2 MiB so this has no PWA impact.
      maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
      globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      runtimeCaching: [{
        urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts',
          expiration: {
            maxEntries: 20,
            maxAgeSeconds: 365 * 24 * 60 * 60
          }
        }
      }]
    }
  })],
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion']
        }
      }
    }
  },
  test: {
    projects: [{
      extends: true,
      plugins: [
      // The plugin will run tests for the stories defined in your Storybook config
      // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
      storybookTest({
        configDir: path.join(dirname, '.storybook')
      })],
      test: {
        name: 'storybook',
        browser: {
          enabled: true,
          headless: true,
          provider: playwright({}),
          instances: [{
            browser: 'chromium'
          }]
        }
      }
    }]
  }
});