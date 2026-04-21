import type { Timestamp } from 'firebase/firestore';

export type TransactionType = 'entrada' | 'saida' | 'receita' | 'despesa';

export type AllowedCategory =
  | 'Alimentação' | 'Transporte' | 'Assinaturas' | 'Educação' | 'Saúde'
  | 'Moradia' | 'Impostos/Taxas' | 'Lazer' | 'Vestuário' | 'Salário'
  | 'Freelance' | 'Investimento' | 'Diversos' | 'Outros' | 'Importado';

export interface Transaction {
  id: string;
  description: string;
  /** Valor em centavos quando vindo do Firestore; em reais quando decriptado para UI */
  value: number;
  type: TransactionType;
  category: AllowedCategory | string;
  date: string;
  account?: string;
  cardId?: string;
  isRecurring?: boolean;
  tags?: string[];
  source?: 'csv' | 'ofx' | 'pdf' | 'manual';
  fitId?: string | null;
  uid?: string;
  createdAt?: Timestamp | number | string | null;
  updatedAt?: Timestamp | number | string | null;
}

export interface ParsedTransaction extends Omit<Transaction, 'id' | 'uid' | 'createdAt' | 'updatedAt'> {
  id: string;
}

export interface RecurringTask {
  id: string;
  uid?: string;
  description: string;
  value: number;
  category: AllowedCategory | string;
  dueDay: number;
  active: boolean;
  type?: TransactionType;
  frequency?: 'mensal' | 'anual';
}

export interface Account {
  id: string;
  name: string;
  type: 'corrente' | 'poupanca' | 'investimento' | 'cartao' | 'divida';
  balance: number;
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

export interface UserCategory {
  id: string;
  name: string;
  keywords: string[];
  category: AllowedCategory | string;
  createdAt?: Timestamp | number | null;
}
