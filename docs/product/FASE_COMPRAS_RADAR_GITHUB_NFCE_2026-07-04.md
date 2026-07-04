# FASE Compras Inteligentes — Radar GitHub e Prova Técnica de Importação Fiscal

Data: 2026-07-04
Status: **planejamento aprovado pelo owner — implementação ainda condicionada ao gate SSRF do threat model**
Pré-requisito normativo: `docs/product/THREAT_MODEL_COMPRAS_INTELIGENTES_NFCE_2026-06-12.md` (§12–§16)

> NFC-e real permanece bloqueada até a fase técnica provar o gate SSRF completo.
> Este documento define o plano dessa fase técnica. Nenhum código deste plano
> autoriza fetch fiscal real antes dos testes de SSRF passarem.

## 1. Estratégia técnica validada (radar de mercado)

Pesquisa em repositórios públicos confirmou que o caminho já definido pelo threat
model é o mesmo usado pelos projetos maduros do ecossistema fiscal brasileiro:

```
QR Code NFC-e ou chave de acesso
→ validação estrita de URL/domínio oficial (allowlist por UF)
→ URL RECONSTRUÍDA canonicamente (nunca fetch da URL bruta do usuário)
→ parser determinístico do XML/HTML fiscal (det/prod: xProd, qCom, vUnCom, vProd)
→ preservação do item fiscal original imutável
→ produto canônico + categoria + histórico de preço (priceObservations)
→ OCR/PDF apenas como último recurso
```

## 2. Repositórios de referência (estudo read-only, sem cópia de código)

| Prioridade | Repositório | Aprendizado |
|---|---|---|
| Alta | `welitonsp/sistema-gestao-compras` | Referência conceitual de domínio (ingestão NFC-e, canonização, classificação). **SGC não é migrado nem copiado** (decisão do threat model §2). |
| Alta | `erpbrasil/erpbrasil.edoc` | Mapa de URLs de consulta por UF (inclui GO: `nfeweb/sites/nfce/danfeNFCe?p=`); montagem/validação de QR Code (chave, versão, ambiente, CSC, hash). |
| Alta | `charines/nfce-parser-api` | API serverless de extração estruturada a partir de URL SEFAZ — arquitetura comparável. |
| Alta | `DFeBrasil/DFeBrasil` | Fixtures XML reais de NFC-e (modelo 65) para nossa suíte de testes. |
| Média/Alta | `kalmonv/node-sped-pdf` | Parser TypeScript com `fast-xml-parser` — mesmo stack do Quantum. |
| Média/Alta | `nfewizard-org/nfewizard-io` | Estrutura TS para `det`/`ide`/`emit`/`total`/`infNFeSupl`. **Verificar licença antes de qualquer reaproveitamento.** |
| Média | `Engenere/BrazilFiscalReport` | Entendimento da estrutura fiscal / DANFE (Python, referência apenas). |
| Baixa | `michaeld555/nfe-parser`, `nfephp-org/nfephp` | Referência conceitual secundária (PHP, stack diferente). |

## 3. Tarefas da fase (ordem obrigatória)

1. **Radar (read-only):** auditar os repositórios acima; mapear **licenças** antes de
   reaproveitar qualquer conceito; produzir matriz de técnicas aproveitáveis.
2. **Fixtures primeiro:** criar fixtures XML NFC-e sintéticas (modelo 65, `det/prod`
   com `xProd`, `qCom`, `vUnCom`, `vProd`, totais, `infNFeSupl`) — base de TDD.
3. **Parser próprio determinístico** (TypeScript, zero float — valores fiscais
   convertidos para centavos via `Decimal.js`, divisões modulo-safe): XML primeiro,
   HTML estruturado da consulta pública como segundo formato.
4. **Gate SSRF (bloqueador de tudo que envolve rede):** implementar e provar por testes:
   - URL do usuário **nunca** é buscada; apenas chave de acesso extraída e validada
     (44 dígitos, DV) → URL reconstruída a partir de allowlist de domínios por UF;
   - bloqueio de `localhost`, `127.0.0.1`, `::1`, RFC1918, link-local, metadata IP,
     IP literal, punycode/Unicode enganoso, userinfo, porta não-443;
   - comparação por hostname real (não substring); redirects re-validados ou proibidos;
   - limites de tamanho/timeout de resposta; DNS rebinding coberto por teste.
5. **Entradas em ordem de prioridade:** QR Code (principal) → HTML colado pelo usuário
   (fallback para CAPTCHA, sem rede) → chave de acesso manual → OCR/PDF (último recurso,
   fase separada).
6. **Persistência:** item fiscal original **imutável** (append-only) + camada de produto
   canônico + categoria + `priceObservations` via callable `recordPriceObservation`
   (já server-trusted, PR #339).
7. **Governança inalterada:** toda gravação financeira derivada passa por confirmação
   humana (contrato do Agente); IA recebe apenas dados minimizados/sanitizados;
   logs sem chave de acesso, CPF/CNPJ ou URL fiscal.

## 4. Critério de liberação da NFC-e real

A NFC-e sai de "bloqueada" somente quando a suíte da fase técnica provar todos os
itens do passo 4 (testes automatizados nomeados no threat model §12–§16), com
revisão humana do owner. Até lá, apenas parser offline sobre fixtures e HTML colado.

## 5. Diferencial de produto

O radar confirma que a importação fiscal em si é terreno conhecido. O diferencial do
Quantum é a integração: importação fiscal + inteligência financeira pessoal +
histórico de preços + cesta pessoal + confirmação humana auditável — nenhum dos
projetos estudados combina os cinco.
