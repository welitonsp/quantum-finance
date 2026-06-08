# Quantum Finance — E2E Tests (Playwright)

## Pré-requisitos

1. **Java/JDK 11+** instalado (para o Firebase Emulator)
2. **Firebase CLI** instalado globalmente: `npm install -g firebase-tools`
3. **Playwright browsers**: `npx playwright install chromium`

## Executar os testes

### Passo 1 — Iniciar os emuladores Firebase
```bash
firebase emulators:start --only auth,firestore
```

### Passo 2 — Executar os testes (em outro terminal)
```bash
npm run test:e2e
```

### Ver relatório HTML após os testes
```bash
npm run test:e2e:report
```

### Modo interativo (debug)
```bash
npm run test:e2e:ui
```

## Estrutura

```
e2e/
├── helpers/
│   ├── auth.ts        # Helper de autenticação (auto-login anônimo via emulator)
│   └── emulator.ts    # Helpers para limpar dados do emulator entre testes
├── tests/
│   ├── 01-smoke.spec.ts            # App carrega, sidebar, navegação
│   ├── 02-transaction-create.spec.ts  # Criação manual de transação
│   ├── 03-transaction-filters.spec.ts # Filtros Todas/Entradas/Saídas/Transferências
│   ├── 04-import-csv.spec.ts          # Upload e preview de CSV
│   └── 05-goals-panel.spec.ts         # Metas de poupança: criar, progresso
└── README.md
```

## Como funciona a autenticação nos testes

Os testes rodam com `VITE_USE_EMULATOR=true`. Isso faz o app:
1. Conectar ao Firebase Auth Emulator (porta 9099) em vez do Firebase real
2. Quando não há usuário logado, chama `signInAnonymously()` automaticamente
3. Dados são isolados no emulator e não afetam produção

## CI/CD

Para rodar em CI, adicione ao workflow:
```yaml
- name: Start Firebase Emulators
  run: firebase emulators:start --only auth,firestore &
  
- name: Wait for emulators
  run: npx wait-on http://127.0.0.1:9099 http://127.0.0.1:8080

- name: Run E2E tests
  run: npm run test:e2e
  env:
    CI: true
```
