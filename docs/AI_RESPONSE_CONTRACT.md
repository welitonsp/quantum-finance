# AI Response Contract — Contrato de Resposta do Agente (FASE H-0)

> Define a estrutura obrigatória das respostas financeiras do agente e o mecanismo de
> **placeholders/pipes** que impede o LLM de emitir números finais. Normativo para a FASE H.
>
> Pré-requisitos: [`AI_AGENT_GUARDRAILS.md`](./AI_AGENT_GUARDRAILS.md) ·
> [`AI_TOOL_ROUTER.md`](./AI_TOOL_ROUTER.md).

---

## 1. Estrutura padrão da resposta

Toda resposta financeira do agente segue seis blocos (alguns opcionais conforme a intenção):

1. **Resumo** — uma frase de veredito.
2. **Dados usados** — quais fontes/motores alimentaram a resposta.
3. **Análise** — explicação narrativa, com valores **somente via placeholder**.
4. **Risco** — alerta(s) relevante(s) (saldo, comprometimento, vencimento…).
5. **Próxima ação sugerida** — consulta, simulação ou proposta de ação.
6. **Confirmação necessária** — presente **somente** quando há `ActionProposal`.

---

## 2. Placeholders e pipes

O LLM **não** escreve números financeiros finais. Ele emite **placeholders** que um
renderizador determinístico resolve a partir do output do motor (sempre em centavos).

Sintaxe: `{{chave|pipe}}`, onde `chave` referencia um campo do resultado da tool.

| Pipe | Uso | Entrada (canônica) | Saída exemplo |
|---|---|---|---|
| `\|brl` | valor monetário | centavos inteiros | `R$ 1.234,56` |
| `\|pct` | percentual | fração (0.30) ou ratio | `30%` |
| `\|date` | data | ISO `YYYY-MM-DD` | `15/07/2025` |
| `\|mes` | competência | `YYYY-MM` | `Jul/2025` |

- O renderizador usa `formatBRL` / `Intl` do projeto — **nunca** formatação ad-hoc do LLM.
- Qualquer número monetário ou percentual **literal** vindo do LLM (fora de placeholder)
  é **rejeitado**: a resposta é bloqueada/reescrita.

---

## 3. Exemplos

### ✅ Correto
```
Resumo: A compra cabe no seu limite efetivo.
Dados usados: cartão "Nubank" (cardProjection), simulador de compra.
Análise: O valor de {{price|brl}} em {{installments}}x mantém o limite efetivo
         em {{effectiveLimitAfterCents|brl}} após a compra. A primeira parcela
         entra na fatura de {{firstCompetencia|mes}}.
Risco: Comprometimento chegaria a {{limitUsagePct|pct}} da renda.
Próxima ação: simular adiar para a próxima fatura, se preferir folga.
```

### ❌ Incorreto (motivos)
```
Você pode comprar! Vai sobrar R$ 412,00 de limite e usar 28% da renda.
```
- Números finais (`R$ 412,00`, `28%`) **literais do LLM** — proibido.
- Sem bloco "Dados usados" — não auditável.
- Sem origem de motor para os valores.

---

## 4. Critérios de aceite das respostas

- [ ] Contém **Resumo**, **Dados usados** e **Análise** (mínimo).
- [ ] Todo valor monetário/percentual/data vem de **placeholder + pipe**.
- [ ] Zero número financeiro literal produzido pelo LLM.
- [ ] Bloco **Confirmação necessária** presente sempre que houver `ActionProposal`.
- [ ] Sob dados insuficientes, declara a limitação em vez de estimar.
- [ ] Testes cobrem: render de cada pipe + **bloqueio de número literal**.
