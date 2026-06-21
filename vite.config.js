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
    registerType: 'autoUpdate',
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
      maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
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
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // Group core React and React Router libraries into a dedicated vendor chunk
          if (id.includes('react/') || id.includes('react-dom/') || id.includes('react-router-dom/') || id.includes('react-router/')) {
            return 'react-core-vendor';
          }
          // Allow Vite/Rollup to handle other node_modules, including framer-motion and auth-libs,
          // using its default chunking strategy. This enables better dynamic splitting
          // if these modules are imported lazily in the application code.
          // No explicit return for other node_modules, letting Vite optimize.
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