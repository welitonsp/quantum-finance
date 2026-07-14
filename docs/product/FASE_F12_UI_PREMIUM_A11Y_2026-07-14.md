# FASE F-12 — UI Premium & Acessibilidade Total (2026-07-14)

> **Análise:** Fable 5 (orquestrador) · **Execução:** builder (Opus 4.8) · **Referência normativa:** WAI-ARIA Authoring Practices (APG), WCAG 2.1 AA.
> Objetivo duplo definido pelo owner: (1) **zerar os 23 warnings a11y restantes** com correções de verdade (não supressão); (2) **navegação minimalista** — a tela principal tem módulos demais e caminha para precisar de scrollbar na sidebar.
> Postura: analista de qualidade — cada tela testada com teclado, leitor de tela em mente e padrão de mercado (Linear/Notion/Revolut: poucos destinos + busca ⌘K + contexto).

---

## 1. Diagnóstico

### 1.1 Os 23 warnings (inventário exato, `npx eslint src`)

**Grupo A — `no-autofocus` (9), em 8 arquivos:**

| # | Arquivo:linha | Contexto | Correção correta |
|---|---|---|---|
| A1 | `src/App.tsx:108` | botão Cancelar do ConfirmDialog | foco programático no mount do diálogo (`useRef`+`useEffect`) |
| A2 | `src/components/BudgetModal.tsx:63` | input de meta no modal | idem (foco ao abrir o diálogo) |
| A3 | `src/components/TradeModal.tsx:64` | input de quantidade no modal | idem |
| A4 | `src/components/LoginScreen.tsx:78` | input email na página de login | **remover** — autofocus em página (não-diálogo) é o caso que a regra realmente pune (rouba contexto de leitor de tela/zoom) |
| A5 | `src/features/shared-finance/SharedFinancePage.tsx:135` | input em formulário/dialog | foco programático ao abrir |
| A6 | `src/features/shared-finance/SharedFinancePage.tsx:395` | idem | idem |
| A7 | `src/features/transactions/AccountsManager.tsx:194` | input de edição inline | foco programático ao entrar em modo edição |
| A8 | `src/features/transactions/import/PasswordPanel.tsx:46` | input senha do PDF | foco programático ao montar o painel |
| A9 | `src/features/transactions/import/PreviewPanel.tsx:144` | input de edição inline | foco programático ao entrar em edição |

> **Racional:** em diálogo, focar o primeiro campo ao abrir é o comportamento **correto** pelo APG — mas via gestão de foco (JS no evento de abertura), não pelo atributo `autoFocus`. Mesma UX, semântica certa, regra satisfeita sem `disable`.

**Grupo B — divs clicáveis (`click-events-have-key-events` + `no-static-element-interactions`, 14 warnings em 7 pontos):**

| # | Arquivo:linha | Padrão | Correção correta |
|---|---|---|---|
| B1 | `src/components/Sidebar.tsx:107` | **backdrop** do menu mobile | `aria-hidden="true"` no backdrop (é redundância de mouse; teclado fecha por Esc/botão X — Esc precisa existir) |
| B2 | `src/features/transactions/AccountsManager.tsx:237` | backdrop do modal Nova Conta | idem + **adicionar Esc** (hoje não existe) |
| B3 | `src/features/transactions/CreditCardManager.tsx:171` | backdrop do dialog | idem + **adicionar Esc** |
| B4 | `src/features/transactions/TransferForm.tsx:118` | backdrop do dialog | idem + **adicionar Esc** |
| B5 | `src/components/BudgetWidget.tsx:380` | card de sugestão com toggle de seleção | é um **checkbox** semântico: `role="checkbox"` + `aria-checked` + `tabIndex={0}` + Enter/Espaço (ou input nativo visually-hidden + label envolvente) |
| B6 | `src/components/BudgetWidget.tsx:405` | div interna `stopPropagation` (guarda de evento) | vira não-problema quando B5 for refeito corretamente; se restar, `role="presentation"` documentado |
| B7 | `src/features/shopping/ShoppingPage.tsx:194` | card de lista que abre detalhe | é um **botão**: converter em `<button className="text-left w-full …">` (preferido) ou `role="button"`+`tabIndex`+teclado |

### 1.2 Gaps premium encontrados além do lint (o lint não vê)

1. **Nenhum dos modais custom fecha com `Esc`** (`TransferForm`, `CreditCardManager` dialog, `AccountsManager` Nova Conta, `BudgetModal`, `TradeModal`) — violação direta do padrão de diálogo do APG. *(BottomSheet/CommandPalette precisam de verificação.)*
2. **Sem focus trap nem retorno de foco** nos modais custom: Tab escapa do diálogo para a página atrás; ao fechar, o foco não volta ao elemento que abriu.
3. **Sem skip-link** ("pular para o conteúdo") — usuário de teclado atravessa a sidebar inteira (20+ tabs) em toda página.
4. **`prefers-reduced-motion` não auditado** — framer-motion anima entradas de modal/página; precisa degradar com a preferência do SO.
5. **Alvos de toque**: itens de nav com `py-2.5` ficam < 44px de altura; revisar contra o mínimo de 44×44 (WCAG 2.5.5 / HIG).

### 1.3 O problema dos módulos (navegação)

- **Desktop (Sidebar): 20 itens em 6 grupos + 2 no rodapé.** Em notebook (~768px de altura útil) já força scroll interno — exatamente o que o owner apontou.
- **Mobile (MobileBottomNav): 4 destinos** (Hoje, Movimentações, Planejar, IA) — **a hierarquia minimalista já existe no produto**; o desktop é que não a segue.
- **CommandPalette (⌘K) já existe** — o mercado (Linear, Notion, Raycast-like) usa exatamente essa dupla: poucos destinos fixos + busca universal para o resto.

---

## 2. Proposta de navegação (decisão de produto — 2 níveis)

### Nível 1 — imediato, sem mudar rotas (PR-B): sidebar sem scroll

- **Grupos colapsáveis** (`<button aria-expanded>` no título do grupo), estado persistido em `localStorage`; default: "Principal" aberto, demais fechados → sidebar cabe em 768px sem scrollbar.
- Densidade: reduzir respiro vertical dos grupos (`space-y-5`→`space-y-3`) mantendo alvo de clique ≥40px.
- Atalho visível para o **⌘K** no topo da sidebar ("Buscar… ⌘K") — reforça a navegação por busca.
- Zero mudança de páginas/rotas; risco baixo.

### Nível 2 — consolidação real (PR-C, **requer decisão do owner**): 20 destinos → 7

Promover ao desktop a hierarquia que o mobile já validou; módulos secundários viram **abas internas** (`TopTabs`, primitivo já existente) da página-mãe:

| Destino (sidebar) | Absorve como abas/entradas internas |
|---|---|
| **Hoje** (Centro de Comando) | — |
| **Movimentações** | Contas · Cartões · Despesas Fixas (recorrentes) |
| **Planejamento** | Orçamentos & Metas · Dívidas · Simulações (Monte Carlo + Simulador de Compra) |
| **Análises** | BI & Relatórios · Timeline · Calendário · Módulo IR |
| **Compras** | Listas · Radar/Preços · NFC-e (já internos) |
| **IA** | Copilot · Quantum AI · Anti-Tarifa |
| **Governança** | Cofre · LGPD/Privacidade · Finanças Compartilhadas |

- Regra de ouro: **nenhuma feature morre** — muda o ponto de entrada. `currentPage` continua funcionando (aliases redirecionam para a página-mãe + aba).
- Pontos em aberto para o owner: (a) Finanças Compartilhadas merece destino próprio se for aposta de produto; (b) IR em Análises ou Governança; (c) ordem dos 7.
- Respeita `docs/UI_UX_ARCHITECTURE.md` (sem react-router; switch `currentPage`).

---

## 3. Checklist de execução (atualizar a cada PR)

### PR-A — Zerar warnings (3 lotes pequenos + gate)

- [ ] **PR-A1 — foco em diálogos (5 arquivos):** `App.tsx` (A1), `BudgetModal` (A2), `TradeModal` (A3), `PasswordPanel` (A8), `PreviewPanel` (A9). Padrão único: `useRef` + `useEffect` de foco no mount/abertura. Incluir `Esc` fecha nos modais tocados que não tenham.
- [ ] **PR-A2 — foco + página (3 arquivos):** `LoginScreen` (A4, remover), `SharedFinancePage` (A5+A6), `AccountsManager` (A7 + B2 backdrop + Esc no modal Nova Conta).
- [ ] **PR-A3 — divs clicáveis (5 arquivos):** `Sidebar` (B1 + Esc fecha menu mobile), `CreditCardManager` (B3 + Esc), `TransferForm` (B4 + Esc), `BudgetWidget` (B5/B6 checkbox semântico), `ShoppingPage` (B7 botão real).
- [ ] **PR-A4 — gate:** elevar `no-autofocus`, `no-static-element-interactions`, `click-events-have-key-events` para `error` no `eslint.config.js` (regressão quebra CI) + sync deste checklist.
- Critérios de aceite por PR: `npx eslint src` sem nenhum warning jsx-a11y nos arquivos tocados; zero mudança visual não intencional; suíte completa verde (`typecheck`, `lint`, `vitest run`, `build`); comportamento de teclado testado (Tab/Enter/Espaço/Esc).

### PR-B — Sidebar sem scroll (Nível 1)

- [ ] Grupos colapsáveis com `aria-expanded`/`aria-controls`, persistência em `localStorage`, animação respeitando `prefers-reduced-motion`.
- [ ] Cabe sem scrollbar em viewport de 768px de altura com 1 grupo aberto.
- [ ] Botão "Buscar ⌘K" no topo (abre CommandPalette).
- [ ] Teste de componente cobrindo colapso/persistência/teclado.

### PR-C — Consolidação de módulos (Nível 2) — **aguardando decisão do owner** (§2)

### Varredura QA premium (contínua, guia por tela)

Para cada tela core (Dashboard, Movimentações, Planejamento, Compras, IA, Governança, Login):
- [ ] Percurso completo só com teclado (sem armadilha, ordem lógica, foco sempre visível).
- [ ] Modais: Esc fecha · foco entra no diálogo ao abrir · foco retorna ao gatilho ao fechar · Tab não escapa (trap).
- [ ] Skip-link "pular para conteúdo" no AppShell.
- [ ] `prefers-reduced-motion` degrada animações do framer-motion.
- [ ] Alvos de toque ≥44px nas superfícies mobile.
- [ ] Contraste AA nos tokens (`quantum-fgMuted` sobre `quantum-card` é o suspeito nº 1).

---

## 4. Guardrails para o executor (builder/Opus)

- Proibido `eslint-disable` para a11y — a correção é semântica, não supressão.
- Proibido tocar `functions/`, `firestore.rules`, schemas, lógica financeira.
- Nenhuma mudança visual além das especificadas; glassmorphism/tokens intactos.
- PR pequeno (≤5 arquivos), branch própria off `main`, sem commit na main, suíte completa antes do push.
- Em ambiguidade (ex.: um modal com comportamento de foco inesperado), **parar e reportar** ao orquestrador — não improvisar.
