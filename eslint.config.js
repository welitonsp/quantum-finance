import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'functions/**', '.firebase/**', '.claude/**', '.claire/**', '*.config.js', 'eslint.config.js', 'playwright.config.ts', 'e2e/**', 'public/**']),
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'off',
      'no-debugger': 'error',
      'no-alert': 'off',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-floating-decimal': 'error',
      eqeqeq: ['error', 'always'],
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/unsupported-syntax': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-refresh/only-export-components': 'off',
      // ── Acessibilidade (jsx-a11y) — finding M-02 da auditoria 2026-07-09 ──
      // Tooling estabelecido; regras objetivas de baixa contagem ficam em `error`
      // (violações já corrigidas). As de alto volume/subjetivas entram como `warn`
      // para dar VISIBILIDADE sem quebrar o CI — RATCHET: subir para `error` à
      // medida que forem zeradas. Não relaxar sem zerar antes.
      'jsx-a11y/label-has-associated-control': 'error',      // F-12: zerado e enforçado
      'jsx-a11y/no-autofocus': 'error',                     // F-12: zerado (PRs A1-A2) — gate de regressão
      'jsx-a11y/click-events-have-key-events': 'error',     // F-12: zerado (PR A3) — gate de regressão
      'jsx-a11y/no-static-element-interactions': 'error',   // F-12: zerado (PR A3) — gate de regressão
    },
  },
]);



