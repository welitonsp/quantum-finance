import type { Timestamp } from 'firebase/firestore';
import type { Centavos } from './money';
import type { AllowedCategory } from '../schemas/financialSchemas';

export type { AllowedCategory } from '../schemas/financialSchemas';

export type CanonicalTransactionType = 'entrada' | 'saida' | 'transferencia';
export type LegacyTransactionType = 'receita' | 'despesa';
export type TransactionType = CanonicalTransactionType | LegacyTransactionType;
export type ReconciliationStatus = 'reconciled';
export type ReconciliationSource = 'import';

export interface Transaction {
  id: string;
  description: string;
  /** Legacy display value. Never use as the canonical source for calculations. */
  value?: number;
  /** Canonical money amount in integer cents. */
  value_cents?: Centavos;
  schemaVersion?: number;
  type: TransactionType;
  category: AllowedCategory | string;
  date: string;
  account?: string;
  accountId?: string;
  cardId?: string;
  /** Conta de origem em transferências. Ausente em transações normais. */
  fromAccountId?: string;
  /** Conta de destino em transferências (accountId de conta ou id de cartão). */
  toAccountId?: string;
  /** ID do grupo de parcelamento — presente em todas as parcelas do mesmo grupo. */
  installmentGroupId?: string;
  /** Índice da parcela dentro do grupo (1-based). */
  installmentIndex?: number;
  /** Número total de parcelas do grupo. */
  installmentCount?: number;
  /** Valor total original do grupo em centavos (para display). */
  installmentTotalCents?: Centavos;
  isRecurring?: boolean;
  tags?: string[];
  source?: 'csv' | 'ofx' | 'pdf' | 'manual';
  fitId?: string | null;
  importHash?: string;
  isDeleted?: boolean;
  deletedAt?: Timestamp | number | string | null;
  reconciliationStatus?: ReconciliationStatus;
  reconciliationSource?: ReconciliationSource;
  reconciledAt?: Timestamp | number | string | null;
  reconciledBy?: string;
  uid?: string;
  createdAt?: Timestamp | number | string | null;
  updatedAt?: Timestamp | number | string | null;
  /** Reserved audit field: ID of the history document paired with the last update. Used for future Rules enforcement via getAfter(). */
  _lastOpId?: string;
  /** Lowercase version of description written on create/update — enables server-side prefix search. */
  descriptionLower?: string;
}

export interface ParsedTransaction extends Omit<Transaction, 'id' | 'uid' | 'createdAt' | 'updatedAt'> {
  id: string;
}

export interface RecurringTask {
  id: string;
  uid?: string;
  description: string;
  value_cents?: Centavos;
  value: number;
  category: AllowedCategory | string;
  dueDay: number;
  active: boolean;
  type?: TransactionType;
  frequency?: 'mensal' | 'anual';
  /** Mês de vencimento para tarefas anuais (1–12). Ignorado em tarefas mensais. */
  dueMonth?: number;
  /** Formato YYYY-MM — último mês em que esta tarefa foi materializada automaticamente. */
  lastExecutedMonth?: string;
}

export interface Account {
  id: string;
  name: string;
  type: 'corrente' | 'poupanca' | 'investimento' | 'cartao' | 'divida';
  /**
   * Saldo em CENTAVOS inteiros após normalização pelo useAccounts.
   * NUNCA acessar diretamente para display — use fromCentavos().
   * Documentos legados (sem schemaVersion) são auto-convertidos no hook.
   */
  balance: Centavos;
  /**
   * Versão do schema deste documento. Documentos v2+ guardam balance em
   * centavos. Documentos sem este campo são legacy (balance em reais float)
   * e são normalizados em memória pelo useAccounts.
   */
  schemaVersion?: 2;
  createdAt?: Timestamp | number | null;
  updatedAt?: Timestamp | number | null;
}

export interface CreditCard {
  id: string;
  name: string;
  limit: number;
  closingDay: number;
  dueDay: number;
  color: string;
  active: boolean;
  createdAt?: Timestamp | number | null;
  updatedAt?: Timestamp | number | null;
}

export interface CardMetrics {
  limitVal: number;
  faturaAtual: number;
  /** Fatura atual em centavos inteiros (fonte canônica para cálculos financeiros). */
  faturaCents: Centavos;
  disponivel: number;
  compromisso: number;
  daysUntilDue: number;
  isOverLimit: boolean;
  alertLevel: 'safe' | 'warning' | 'critical';
}

export interface CreditCardWithMetrics extends CreditCard {
  metrics: CardMetrics;
}

export interface ModuleBalance {
  saldo: number;
  receitas: number;
  despesas: number;
  patrimonio: number;
  dividas: number;
}

export interface ModuleBalances {
  geral: ModuleBalance;
  [key: string]: ModuleBalance;
}

export interface CategoryDataPoint {
  name: string;
  value: number;
  color: string;
}

export interface ImportResult {
  added: number;
  duplicates: number;
  invalid: number;
}

export interface SummarySnapshot {
  uid: string;
  period: string;
  schemaVersion: 2;
  totalIncomeCents: Centavos;
  totalExpenseCents: Centavos;
  netCashflowCents: Centavos;
  assetBalanceCents: Centavos;
  liabilityBalanceCents: Centavos;
  transactionCount: number;
  generatedAt?: Timestamp | number | string | null;
}

export interface UserCategory {
  id: string;
  name: string;
  keywords: string[];
  category: AllowedCategory | string;
  createdAt?: Timestamp | number | null;
}

export interface SavingsGoal {
  id:           string;
  name:         string;
  /** Valor alvo em centavos inteiros. */
  targetCents:  Centavos;
  /** Valor acumulado atual em centavos inteiros (atualizado manualmente ou por cálculo). */
  currentCents: Centavos;
  /** Data limite ISO (YYYY-MM-DD), opcional. */
  deadline?:    string | null;
  emoji?:       string;
  createdAt?:   Timestamp | number | null;
  updatedAt?:   Timestamp | number | null;
}
