/**
 * FirestoreService.ts — barrel that assembles domain repos into a single
 * object and re-exports all public types consumed by callers.
 *
 * Callers (useTransactions, useRecurring, TransferForm, etc.) import from
 * here and must not be changed.
 */

export { TransferCreateDTOSchema, type TransferCreateDTO } from './firestoreCore';
export type { InstallmentGroupCreateDTO, TransactionUpdateDTO, ManualTransactionCreateDTO } from './firestoreCore';
export { resolveCompetencia } from './firestoreCore';

import { transactionRepo } from './transactionRepo';
import { transferRepo } from './transferRepo';
import { installmentRepo } from './installmentRepo';
import { recurringRepo } from './recurringRepo';

export const FirestoreService = {
  ...transactionRepo,
  ...transferRepo,
  ...installmentRepo,
  ...recurringRepo,
};
