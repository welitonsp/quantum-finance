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
            normalizedId.includes('/node_modules/react/') ||
            normalizedId.includes('/node_modules/react-dom/') ||
            normalizedId.includes('/node_modules/scheduler/')
          ) {
            return 'vendor-react';
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
        // F-13: módulos pure-logic em features/ com testes dedicados
        'src/features/simulation/forecastMonteCarlo.ts',
        'src/features/transactions/import/importHelpers.ts',
        'src/features/ai-agent/intentRegistry.ts',
        'src/features/transactions/import/processResolvedImportBatch.ts',
        'src/features/transactions/importCandidateSearch.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        'src/**/*.d.ts',
        '**/.claude/**',
        '**/.claude/worktrees/**',
        // F-11: outbox IndexedDB — glue não exercitável em jsdom (sem fake-indexeddb,
        // que tocaria package-lock/zona protegida). O comportamento fail-safe é testado
        // em offlineOutbox.test.ts; as branches de sucesso do IndexedDB rodam no browser real.
        'src/shared/lib/offlineOutbox.ts',
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
      // Ratchet 2026-07-10 (PR #381): ofxParser (+8 testes) + forecastEngine (+5 testes) branches adicionais.
      // Bump conservador: branches 59→60. Meta final: branches 65 / lines 75.
      // ⚠️ 2026-07-10 (PR #382): ratchet branches 59→60 ficou ACIMA da real (~59.8%) → CI do main vermelho.
      // Corrigido em #383 com cobertura real (→60.04); #385 (→60.22), #387 (→60.47), #389 (→61.54).
      // Ratchet 2026-07-10 (pós-#389 / #390): gates → stmts 68 / branches 61 / funcs 68 / lines 72.
      // Ratchet 2026-07-10 (pós-#391 useWeeklyCashflow + #393 useForecast): real medido
      // stmts 71.10 / branches 63.22 / funcs 71.01 / lines 74.50 → sobe todos 2 pts (margem ≥1% cada).
      // 🎯 2026-07-10 (pós-#395 useGoals + #396 useBudgets): METAS FINAIS M-01 atingidas —
      // real stmts 73.59 / branches 65.52 / funcs 74.30 / lines 76.94. branches≥65 e lines≥75.
      // Gates fixados logo abaixo do real (catraca): stmts 72 / branches 64 / funcs 73 / lines 75.
      // Reforço 2026-07-10 (pós-#398 useDebts + #399 useCategories + #400 useChallenges):
      // real stmts 77.48 / branches 68.19 / funcs 79.40 / lines 80.78 → gates → 75 / 67 / 78 / 79.
      // Reforço 2026-07-11 (pós-#402 updateRecurringWithHistory + #403 recurringRepo):
      // real stmts 78.03 / branches 68.55 / funcs 79.83 / lines 81.29 → gates → 77 / 68 / 79 / 80.
      // F-13 2026-07-14: scope expandido (+3 features pure-logic: forecastMonteCarlo, importHelpers,
      // intentRegistry). Real pós-expansão: stmts 78.13 / branches 68.61 / funcs 79.89 / lines 81.37.
      // Melhora <0,5% em todos os eixos → sem ratchet (regra: ≥0,5% margem real medida). Gates mantidos.
      // F-13 2026-07-15: scope +2 (processResolvedImportBatch, importCandidateSearch) com 31 testes.
      // Real pós-expansão: stmts 78.41 / branches 68.98 / funcs 80.04 / lines 81.64.
      // Melhora <0,5% em todos os eixos vs. base → sem ratchet. Gates mantidos.
      thresholds: {
        lines: 80,
        functions: 79,
        branches: 68,
        statements: 77,
      },
    },
  },
});
