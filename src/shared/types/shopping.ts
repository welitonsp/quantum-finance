import type { Centavos } from './money';

export type ShoppingUnit = 'un' | 'kg' | 'g' | 'L' | 'mL' | 'cx' | 'pct' | 'dz';

export interface ShoppingListItem {
  id: string;
  productName: string;
  quantity: string;           // string decimal validada, ex: "1.5"
  unit: ShoppingUnit;
  estimatedUnitPriceCents: Centavos;
  estimatedTotalCents: Centavos;
  actualUnitPriceCents?: Centavos;
  actualTotalCents?: Centavos;
  store?: string;
  checked: boolean;           // marcado como comprado
  notes?: string;
  createdAt: string;          // ISO timestamp
  checkedAt?: string;
}

export interface ShoppingList {
  id: string;
  uid: string;
  name: string;
  scheduledDate?: string;     // YYYY-MM-DD — data planejada da compra
  estimatedTotalCents: Centavos;
  actualTotalCents?: Centavos;
  status: 'open' | 'in_progress' | 'done';
  linkedTransactionId?: string; // vínculo com Transaction existente
  items: ShoppingListItem[];
  createdAt: string;
  updatedAt: string;
  schemaVersion: 1;
}

export interface PriceObservation {
  id: string;
  uid: string;
  productName: string;        // nome normalizado (lowercase trim)
  store: string;
  unitPriceCents: Centavos;
  quantity: string;
  unit: ShoppingUnit;
  observedAt: string;         // YYYY-MM-DD
  sourceListId?: string;      // lista de origem
  createdAt: string;
  schemaVersion: 1;
}

export type ShoppingListCreatePayload = Omit<
  ShoppingList,
  'id' | 'uid' | 'createdAt' | 'updatedAt' | 'schemaVersion' | 'actualTotalCents' | 'linkedTransactionId'
>;

export type ShoppingListItemCreatePayload = Omit<
  ShoppingListItem,
  'id' | 'createdAt' | 'checkedAt' | 'actualUnitPriceCents' | 'actualTotalCents'
>;
