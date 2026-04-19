// vite.config.ts — Quantum Finance
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Excluir workers do cache do service worker (geridos pelo browser diretamente)
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
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':    ['react', 'react-dom'],
          // firebase/functions incluído — necessário para o proxy seguro da IA
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/functions'],
          'vendor-charts':   ['chart.js', 'react-chartjs-2', 'recharts'],
          'vendor-utils':    ['decimal.js', 'zod', '@tanstack/react-query'],
          // pdfjs separado — carrega apenas quando o utilizador importa um PDF
          'vendor-pdfjs':    ['pdfjs-dist'],
        },
      },
    },
    chunkSizeWarningLimit: 500,
    sourcemap: false,
  },
  // Configuração explícita para Web Workers (Vite trata ?worker como ES module)
  worker: {
    format: 'es',
  },
})
