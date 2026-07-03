# Estrategia API-Ready com Orcamento Zero

Documento para orientar a evolucao do Quantum Finance para ficar pronto para Pix, Open Finance, bancos, birôs, gateways e outras APIs financeiras pagas, sem depender de chaves, contratos comerciais ou custos externos no momento atual.

## 1. Principio Central

O projeto deve ser construido como **API-ready**, nao **API-dependent**.

Isso significa:

- o core financeiro funciona sem APIs pagas;
- integracoes externas ficam atras de interfaces;
- todo provider real pode ser substituido por mock/local fixture;
- nenhuma chave externa e obrigatoria para rodar o produto;
- o produto demonstra maturidade arquitetural mesmo sem contrato com bancos ou fintechs;
- quando surgir oportunidade comercial, basta plugar providers reais.

Frase guia:

> Hoje o Quantum Finance roda com dados locais, imports e mocks. Amanha ele conecta Open Finance, Pix, bancos e parceiros sem reescrever o ledger.

## 2. O Que Nao Fazer Agora

Nao gastar energia nem dinheiro com:

- contratar API bancaria paga;
- depender de credenciais de Pix/Open Finance reais;
- expor secrets em ambiente local;
- criar integracao hardcoded com um unico fornecedor;
- prometer operacao regulada sem certificacao;
- fazer scraping bancario;
- coletar dados reais de usuarios para demo;
- construir fluxo que so funciona com API paga.

## 3. O Que Fazer Agora

Construir uma camada de integracao profissional:

1. Interfaces de dominio.
2. Adapters por provider.
3. Mocks deterministas.
4. Fixtures de demo.
5. Feature flags.
6. Contratos de consentimento.
7. Normalizacao de dados.
8. Testes de contrato.
9. Documentacao de como plugar provider real.

## 4. Arquitetura Recomendada

Criar uma estrutura conceitual como:

```text
src/integrations/
  core/
    FinancialProvider.ts
    ProviderRegistry.ts
    ConsentContract.ts
    NormalizedFinancialData.ts
  providers/
    mock/
      MockOpenFinanceProvider.ts
      mockStatements.fixture.ts
    manual/
      ManualImportProvider.ts
    csv/
      CsvImportProvider.ts
    ofx/
      OfxImportProvider.ts
    pix/
      PixProvider.contract.ts
      MockPixProvider.ts
    open-finance/
      OpenFinanceProvider.contract.ts
      MockOpenFinanceProvider.ts
  tests/
    providerContract.test.ts
```

No backend, quando necessario:

```text
functions/src/integrations/
  providers/
  normalizers/
  consent/
```

Regra:

> UI e dominio nunca devem conhecer detalhes de um provider real. Eles consomem apenas dados normalizados.

## 5. Contratos de Provider

### 5.1 FinancialProvider

Cada provider deve implementar um contrato parecido com:

```ts
export interface FinancialProvider {
  id: string;
  displayName: string;
  capabilities: ProviderCapability[];
  connect(input: ConnectInput): Promise<ConnectResult>;
  sync(consent: ConsentRef): Promise<ProviderSyncResult>;
  disconnect(consent: ConsentRef): Promise<void>;
}
```

Capabilities possiveis:

```ts
export type ProviderCapability =
  | 'accounts.read'
  | 'transactions.read'
  | 'creditCards.read'
  | 'investments.read'
  | 'pix.keys.read'
  | 'pix.payments.initiate'
  | 'boleto.read'
  | 'identity.read';
```

### 5.2 NormalizedFinancialData

Todos os providers devem virar o mesmo formato:

```ts
export interface NormalizedFinancialData {
  accounts: NormalizedAccount[];
  transactions: NormalizedTransaction[];
  creditCards: NormalizedCreditCard[];
  investments?: NormalizedInvestment[];
  metadata: {
    providerId: string;
    syncedAt: string;
    consentId?: string;
    source: 'mock' | 'manual' | 'csv' | 'ofx' | 'open-finance' | 'pix' | 'partner-api';
  };
}
```

O ledger interno continua usando `value_cents`.

## 6. Modo Demo Sem Custo

Criar um modo demo forte, com seed data realista mas ficticio.

### 6.1 Dados ficticios brasileiros

Incluir:

- salario;
- aluguel;
- supermercado;
- Pix recebido;
- Pix enviado;
- cartao de credito;
- fatura;
- parcelas;
- assinatura;
- tarifa bancaria;
- emprestimo/divida;
- meta;
- despesa compartilhada.

### 6.2 Historias demonstraveis

Cada fixture deve permitir demonstrar:

1. "Posso comprar este produto em 10x?"
2. "Minha fatura futura vai estourar?"
3. "Quais assinaturas estao pesando?"
4. "Que tarifa recorrente posso cortar?"
5. "Qual sera meu saldo em 90 dias?"
6. "Como a IA chegou nessa recomendacao?"

### 6.3 Sem dados reais

Os fixtures devem:

- nao conter CPF real;
- nao conter emails reais;
- nao conter nomes de pessoas reais;
- nao conter chaves Pix reais;
- marcar claramente `demo: true`.

## 7. Feature Flags

Toda integracao externa deve ficar atras de flag:

```text
VITE_ENABLE_MOCK_PROVIDERS=true
VITE_ENABLE_OPEN_FINANCE=false
VITE_ENABLE_PIX=false
VITE_ENABLE_PARTNER_APIS=false
```

No backend:

```text
ENABLE_OPEN_FINANCE=false
ENABLE_PIX=false
ENABLE_PARTNER_APIS=false
```

Regra:

- se a flag estiver false, nenhum codigo deve tentar chamar API externa;
- o app deve continuar funcional com mocks/imports;
- o build de producao nao deve exigir chave inexistente.

## 8. Secrets e Configuracao

Criar apenas exemplos, nunca valores reais:

```text
.env.example
OPEN_FINANCE_CLIENT_ID=
OPEN_FINANCE_CLIENT_SECRET=
PIX_PROVIDER_API_KEY=
PARTNER_BANK_API_KEY=
```

Boas praticas:

- `.env` e `.env.local` ignorados no Git;
- secrets reais so em Secret Manager/GitHub Secrets;
- testes usam valores dummy;
- nenhum teste depende de rede externa;
- nenhum log imprime segredo.

## 9. Open Finance Ready

Sem acessar APIs reais agora, preparar:

### 9.1 Consent model

```ts
export interface ConsentRecord {
  id: string;
  uid: string;
  providerId: string;
  scopes: ProviderCapability[];
  status: 'pending' | 'active' | 'revoked' | 'expired';
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
}
```

### 9.2 Fluxo futuro

1. Usuario escolhe provider.
2. Sistema cria consentimento.
3. Provider real redireciona/autentica.
4. Sync retorna dados normalizados.
5. Ledger importa com reconciliacao.
6. Usuario pode revogar.
7. Delete/export LGPD cobre dados importados.

### 9.3 O que implementar agora

- telas e estados com mock provider;
- contrato de consentimento;
- logs de consentimento;
- testes de revogacao;
- importacao normalizada para ledger.

## 10. Pix Ready

Sem operar Pix real agora, preparar:

### 10.1 Pix como dominio, nao pagamento real

Implementar apenas:

- representacao de transacao Pix;
- categorizacao;
- deteccao de recorrencia;
- explicacao de fluxo;
- fixtures;
- parser/import de descricoes Pix em extratos.

Nao implementar:

- iniciacao real de pagamento;
- QR real;
- copia-e-cola real;
- consulta real a chave;
- qualquer fluxo que pareca movimentar dinheiro.

### 10.2 Contrato futuro

```ts
export interface PixProvider {
  listKeys(): Promise<PixKey[]>;
  validateKey(key: string): Promise<PixKeyValidationResult>;
  initiatePayment(input: PixPaymentInput): Promise<PixPaymentProposal>;
}
```

Execucao real de Pix, no futuro, deve seguir:

- proposta backend;
- confirmacao humana;
- provider regulado;
- logs forenses;
- idempotencia;
- limites;
- antifraude.

## 11. Parceiros e APIs Pagas

Preparar o projeto para receber:

- API de Open Finance;
- API de banco parceiro;
- API de enriquecimento de transacoes;
- API de score/credito;
- API de cambio;
- API de investimentos;
- API de notas/boletos;
- API antifraude.

Cada provider real deve entrar por adapter, nunca direto no core.

## 12. Testes de Contrato

Criar uma suite que qualquer provider deve passar:

1. retorna dados normalizados;
2. nunca retorna float para dinheiro;
3. converte valores para centavos;
4. respeita consentimento ativo;
5. falha se consentimento revogado;
6. nao imprime PII em log;
7. nao imprime secrets;
8. suporta retry seguro;
9. retorna erro tipado;
10. nao quebra UI se provider estiver indisponivel.

## 13. Experiencia Para Investidor Sem API Paga

Mesmo sem APIs reais, o investidor precisa enxergar que o produto esta pronto.

Criar uma demo:

- "Conectar banco demo";
- "Sincronizar dados ficticios";
- "Revogar consentimento";
- "Ver dados importados";
- "Rodar IA sobre dados consentidos";
- "Ver trilha de auditoria";
- "Exportar/deletar dados".

Mensagem:

> Esta demo usa provider ficticio, mas a arquitetura e a mesma para conectar providers reais quando houver contrato comercial.

## 14. Roadmap Sem Custo

### Fase 1 - Contratos

- criar interfaces;
- criar mock providers;
- criar fixtures;
- documentar `.env.example`.

### Fase 2 - Demo Mode

- seed data;
- botao "usar banco demo";
- fluxo de consentimento fake;
- sync fake;
- revogacao fake.

### Fase 3 - Normalizacao

- normalizar transacoes;
- normalizar contas;
- normalizar cartoes;
- reconciliar com ledger.

### Fase 4 - Provider SDK Interno

- testes de contrato;
- registry;
- feature flags;
- erros tipados;
- observabilidade.

### Fase 5 - Provider Real Futuro

Quando houver oportunidade:

- escolher provider;
- implementar adapter;
- configurar secrets;
- rodar sandbox;
- revisar juridico/LGPD;
- habilitar flag para ambiente controlado.

## 15. Checklist API-Ready

O projeto esta pronto para APIs financeiras quando:

- roda sem API paga;
- tem mocks completos;
- tem contratos de provider;
- tem consentimento e revogacao;
- tem normalizacao para ledger;
- tem testes de contrato;
- tem flags;
- tem `.env.example`;
- nao exige rede externa nos testes;
- nao vaza secrets;
- tem documentacao de como plugar provider real.

## 16. Conclusao

Nao ter orcamento para APIs pagas nao limita a ambicao do Quantum Finance.

Na verdade, pode ser uma vantagem: o projeto sera obrigado a criar uma arquitetura limpa, desacoplada e vendavel.

O alvo e:

> construir hoje a tomada, o painel eletrico e os disjuntores; amanha, quando vier a energia dos providers reais, o produto ja esta pronto para ligar.

