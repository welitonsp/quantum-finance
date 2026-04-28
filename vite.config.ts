/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

function normalizePath(id: string): string {
  return id.replace(/\\/g, '/');
}

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/workers/*.js'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      manifest: {
        name: 'Quantum Finance',
        short_name: 'Quantum',
        description: 'Gestão Financeira de Elite e Inteligência Artificial',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = normalizePath(id);

          if (!normalizedId.includes('/node_modules/')) {
            return undefined;
          }

          if (normalizedId.includes('/node_modules/firebase/')) {
            return 'vendor-firebase';
          }

          if (
            normalizedId.includes('/node_modules/recharts/') ||
            normalizedId.includes('/node_modules/chart.js/') ||
            normalizedId.includes('/node_modules/react-chartjs-2/') ||
            normalizedId.includes('/node_modules/d3-')
          ) {
            return 'vendor-charts';
          }

          if (
            normalizedId.includes('/node_modules/decimal.js') ||
            normalizedId.includes('/node_modules/zod/') ||
            normalizedId.includes('/node_modules/@tanstack/react-query/')
          ) {
            return 'vendor-utils';
          }

          if (
            normalizedId.includes('/node_modules/framer-motion/') ||
            normalizedId.includes('/node_modules/lucide-react/')
          ) {
            return 'vendor-ui';
          }

          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 500,
    sourcemap: false,
  },

  worker: {
    format: 'es',
  },

  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    css: false,

    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
    ],

    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.git/**',
      '**/.firebase/**',
      '**/.claude/**',
      '**/.claude/worktrees/**',
    ],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      include: [
        'src/shared/types/**/*.ts',
        'src/shared/schemas/**/*.ts',
        'src/shared/lib/**/*.ts',
        'src/shared/services/**/*.ts',
        'src/utils/**/*.ts',
        'src/hooks/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        'src/**/*.d.ts',
        '**/.claude/**',
        '**/.claude/worktrees/**',
      ],
      thresholds: {
        lines: 14,
        functions: 12,
        branches: 7,
        statements: 13,
      },
    },
  },
});
