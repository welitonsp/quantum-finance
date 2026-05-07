# Quantum Finance Cloud

> Aplicação de gestão financeira pessoal com precisão contábil, auditoria completa e IA assistiva.

## Visão Geral

Quantum Finance é uma aplicação web voltada para pessoas físicas que precisam de controle financeiro rigoroso.
Permite importar extratos bancários de múltiplos formatos e bancos, categorizar transações automaticamente com IA,
conciliar lançamentos contra extratos com explicabilidade visual e acompanhar orçamentos, projeções e indicadores
de saúde financeira em tempo real. O modelo de dados usa centavos inteiros como fonte canônica, eliminando erros
de arredondamento e garantindo precisão bancária em todos os cálculos.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS · Firebase/Firestore · Cloud Functions · Framer Motion · Chart.js · pdfjs-dist · Gemini AI

## Features Principais

- Importação de extratos: CSV, OFX, PDF (com suporte a senha)
- Templates de mapeamento para 10+ bancos brasileiros (Nubank, Inter, Itaú, Bradesco, BB, Caixa, Santander, C6, Mercado Pago, PicPay)
- Deduplicação tricamada: fingerprint local, SHA-256 (importHash) e busca cross-page no Firestore
- Conciliação interativa com explicabilidade (confiança, razões do match) e status persistente
- Filtros avançados: data, valor, origem, tipo, categoria, status de conciliação
- Auditoria por transação com snapshot before/after e timeline global
- Auto-categorização via Gemini AI com regras persistidas
- Orçamentos por categoria com acompanhamento mensal
- Previsão financeira Monte Carlo
- Acessibilidade WCAG 2.1 AA (focus trap, aria-live, retorno de foco, navegação por teclado)
- Segurança: isolamento por usuário (`users/{uid}/...`), Firestore Rules com schema versionado, Cloud Functions server-trusted

## Como Rodar

```bash
git clone https://github.com/welitonsp/quantum-finance.git
cd quantum-finance
npm install
npm run dev
```

Crie um arquivo `.env.local` na raiz com as variáveis do Firebase:

```env
VITE_FIREBASE_API_KEY="sua_api_key"
VITE_FIREBASE_AUTH_DOMAIN="seu_projeto.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="seu_projeto"
VITE_FIREBASE_STORAGE_BUCKET="seu_projeto.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="123456789"
VITE_FIREBASE_APP_ID="1:123456789:web:abcdef"
```

Chaves de IA (Gemini) devem ser configuradas exclusivamente no backend via Firebase Secret Manager:

```bash
firebase functions:secrets:set GEMINI_API_KEY
firebase deploy --only functions
```

## Comandos

```bash
npm run dev          # servidor de desenvolvimento
npm run build        # build de produção
npm run typecheck    # verificação de tipos
npm run lint         # linting
npm run test         # testes unitários (watch)
npm run test -- --run  # testes unitários (one-shot)
npm run test:rules   # testes de Firestore Rules (requer Java/JDK e emulator)
```

> `npm run test:rules` requer Java instalado. Em caso de erro `Could not spawn java -version`:
> ```bash
> winget install EclipseAdoptium.Temurin.21.JDK
> ```

## Arquitetura

O projeto segue Feature-Sliced Design (FSD):

```
src/
  components/     # Componentes UI globais e de layout (Dashboard, Header, Sidebar)
  contexts/       # Contextos globais (Theme, Privacy, Navigation)
  features/       # Módulos de negócio isolados
    ai-chat/      # Chat com IA assistiva
    reports/      # Relatórios e análises
    transactions/ # Movimentações, importação, conciliação
  hooks/          # Hooks de acesso ao Firestore (useTransactions, useAccounts, ...)
  shared/         # Schemas Zod, serviços Firebase, parsers de arquivo, tipos centrais
  utils/          # Formatadores e motores matemáticos independentes de UI
```

Toda persistência financeira passa por `LedgerService` ou `FirestoreService`.
Auditoria é registrada em `users/{uid}/transactions/{txId}/history` e `users/{uid}/audit_logs`.
Firestore Rules implementam validação de schema na camada de segurança (schema version 2).

## Licença

MIT
