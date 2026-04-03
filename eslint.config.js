// ✅ eslint.config.js REFORÇADO
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars':     ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'no-console':         ['warn', { allow: ['warn', 'error'] }], // ← bloqueia console.log em produção
      'no-debugger':        'error',
      'no-alert':           'error',  // ← pega o alert() que encontramos no App.jsx
      'no-eval':            'error',
      'no-implied-eval':    'error',
      'no-floating-decimal': 'error', // ← captura erros como .5 ao invés de 0.5
      'eqeqeq':             ['error', 'always'], // ← força === em vez de ==
    },
  },
])