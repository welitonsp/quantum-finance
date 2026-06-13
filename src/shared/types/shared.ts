import type { Centavos } from './money';

export type SplitMethod = 'igual' | 'proporcional' | 'personalizado';

export interface GroupMember {
  uid: string;
  displayName: string;
  email: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  ownerUid: string;
  memberUids: string[];
  members: GroupMember[];
  createdAt: string;
  updatedAt: string;
  schemaVersion: 1;
}

export interface SharedExpenseShare {
  uid: string;
  displayName: string;
  /** Valor que este membro deve pagar em centavos */
  amountCents: Centavos;
  paid: boolean;
  paidAt?: string;
}

export interface SharedExpense {
  id: string;
  groupId: string;
  description: string;
  totalCents: Centavos;
  category: string;
  date: string;
  /** UID de quem pagou a despesa antecipadamente */
  payerUid: string;
  payerDisplayName: string;
  splitMethod: SplitMethod;
  shares: SharedExpenseShare[];
  createdAt: string;
  updatedAt: string;
  schemaVersion: 1;
}

export type GroupCreatePayload = Omit<
  Group,
  'id' | 'ownerUid' | 'memberUids' | 'createdAt' | 'updatedAt' | 'schemaVersion'
>;

export type SharedExpenseCreatePayload = Omit<
  SharedExpense,
  'id' | 'groupId' | 'createdAt' | 'updatedAt' | 'schemaVersion'
>;
