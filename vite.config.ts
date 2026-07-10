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
      // injectManifest: SW customizado em src/sw.ts — necessário para FCM
      // background push (onBackgroundMessage) no mesmo SW de caching.
      // navigateFallback e runtime caching de fonts vivem agora em src/sw.ts.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/workers/*.js'],
      },
      manifest: {
        name: 'Quantum Finance',
        short_name: 'Quantum',
        description: 'Gestão Financeira de Elite com Inteligência Artificial',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'pt-BR',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          {
            name: 'Nova Movimentação',
            short_name: 'Nova',
            url: '/?action=nova-movimentacao',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Timeline Financeira',
            short_name: 'Timeline',
            url: '/?page=timeline',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Copilot IA',
            short_name: 'Copilot',
            url: '/?page=copilot',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
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
        'src/lib/**/*.ts',
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
      // Recalibrado em 2026-06-12: FASES 3-8 (#202-#207) mergearam com CI
      // vermelho (main não compilava) e erodiram a cobertura sem o gate agir.
      // Valores fixados logo abaixo do real atual para funcionar como catraca.
      // Bump em 2026-07-02 (auditoria P3): statements 59→60, lines 63→64
      // alinhados com baseline Codex (60% statements) e medição real (63.89 lines).
      // Ratchet 2026-07-09 (finding M-01 PR #366): branches 50→51 (real 51.16%).
      // Ratchet 2026-07-09 (PR #368): src/lib/** adicionado ao scope + 34 testes
      // (cashflowTimeline, contextSerializer, ofxParser). Salto real:
      // stmts 60.19→66.2, branches 51.16→56.27, funcs 60.75→66.24, lines 64.13→70.24.
      // Ratchet 2026-07-09 (PR #370): +34 testes (ForecastChart + transactionsToCSV/escapeCSV).
      // Salto real: stmts 66.2→66.96, branches 56.27→57.09, funcs 66.24→66.87, lines 70.24→70.97.
      // Ratchet 2026-07-09 (PR #372): +16 testes (forecastEngine health/projection, hashGenerator, riskScore).
      // Salto real: stmts 66.96→67.01, branches 57.09→57.32, funcs 66.87→66.87, lines 70.97→70.97.
      // Ratchet 2026-07-09 (PR #374): +55 testes (insightsEngine, debtStrategy, cardProjection).
      // Salto real: stmts 67.01→67.12, branches 57.32→57.75, funcs 66.87→66.87, lines 70.97→70.97.
      // PR #376: fix Centavos type em insightsEngine/cardProjection + purchaseSimulator + shoppingRadar tiebreaker.
      // Coverage estável (purchaseSimulator já atingia 97.95% branches via outros testes).
      // Ratchet 2026-07-09 (PR #377): csvParser (26 testes) + cashflowTimeline branches (+11 testes).
      // Salto real: stmts 67.12→67.69, branches 57.75→58.56, funcs 66.87→67.19, lines 70.97→71.38.
      // Ratchet 2026-07-10 (PR #379): insightsEngine pilares (+16 testes) + exportCSV branches (+8 testes).
      // Salto real: stmts 67.69→67.70, branches 58.56→59.18, funcs 67.19→67.19, lines 71.38→71.38.
      // Próxima meta: branches 65 / lines 75 — campanha sustentada M-01.
      thresholds: {
        lines: 71,
        functions: 67,
        branches: 59,
        statements: 67,
      },
    },
  },
});
