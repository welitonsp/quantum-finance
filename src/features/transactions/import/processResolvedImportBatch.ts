import { serverTimestamp } from 'firebase/firestore';
import { transactionCreateSchema } from '../../../shared/schemas/financialSchemas';
import { toCentavos, type Centavos } from '../../../shared/types/money';
import { FirestoreService } from '../../../shared/services/FirestoreService';
import type { Transaction } from '../../../shared/types/transaction';
import type { ParsedTransaction, ImportResult } from './importTypes';
import { buildReconciliationHistoryDelta } from './importHelpers';
import { logSanitizedFirebaseError } from '../../../shared/lib/firebaseErrorHandling';

export async function processResolvedImportBatch(
  uid: string | undefined,
  selectedTxs: ParsedTransaction[],
  onImportTransactions: (txs: ParsedTransaction[]) => Promise<ImportResult | void>,
  existingTransactions: Transaction[] = [],
): Promise<{
  added:           number;
  reconciledCount: number;
  invalidCount:    number;
  duplicates:      number | undefined;
  validCount:      number;
}> {
  const toImport: Partial<Transaction>[] = [];
  const toUpdate: Array<{ id: string; data: Partial<Transaction>; before: Transaction | undefined }> = [];
  const existingTransactionById = new Map(existingTransactions.map(tx => [tx.id, tx]));
  let invalidCount = 0;

  for (const tx of selectedTxs) {
    const {
      id: previewId,
      value: legacyValue,
      _selected,
      _aiCategorized,
      _reconciled,
      _mergedWith,
      ...rawTx
    } = tx;
    void _selected;
    void _aiCategorized;
    void _mergedWith;

    const cleanTx = {
      ...rawTx,
      value_cents:   rawTx.value_cents ?? toCentavos(legacyValue ?? 0),
      schemaVersion: 2,
      source:        rawTx.source ?? 'csv',
    };

    const zodResult = transactionCreateSchema.safeParse(cleanTx);
    if (!zodResult.success) {
      invalidCount++;
      logSanitizedFirebaseError('transaction_import', new Error('schema_validation_failed'));
      continue;
    }

    const parsedData = zodResult.data;
    const validData: Partial<Transaction> = {
      description:   parsedData.description,
      value_cents:   parsedData.value_cents as Centavos,
      type:          parsedData.type,
      category:      parsedData.category,
      date:          parsedData.date,
      source:        parsedData.source,
      schemaVersion: 2,
    };
    if (parsedData.account     !== undefined) validData.account     = parsedData.account;
    if (parsedData.accountId   !== undefined) validData.accountId   = parsedData.accountId;
    if (parsedData.cardId      !== undefined) validData.cardId      = parsedData.cardId;
    if (parsedData.fitId       !== undefined) validData.fitId       = parsedData.fitId;
    if (parsedData.tags        !== undefined) validData.tags        = parsedData.tags;
    if (parsedData.isRecurring !== undefined) validData.isRecurring = parsedData.isRecurring;

    // Reconciled against an existing Firestore doc: update in place so no duplicate is created at the hash path
    if (_reconciled === true && !!previewId && !previewId.startsWith('__temp_') && !!uid) {
      toUpdate.push({
        id: previewId,
        data: {
          ...validData,
          reconciliationStatus: 'reconciled',
          reconciliationSource: 'import',
          reconciledAt: serverTimestamp() as unknown as Exclude<Transaction['reconciledAt'], undefined>,
          reconciledBy: uid,
        },
        before: existingTransactionById.get(previewId),
      });
    } else {
      toImport.push(validData);
    }
  }

  for (const { id, data, before } of toUpdate) {
    if (!uid) continue;
    const historyDelta = buildReconciliationHistoryDelta(before, data);
    await FirestoreService.updateTransactionWithHistory(uid, id, data, {
      before:       historyDelta.before ?? {},
      after:        historyDelta.after  ?? {},
      changedFields: historyDelta.changedFields,
      origin:       'reconcile',
      ...(data.value_cents !== undefined ? { amount_cents: data.value_cents as number } : {}),
      ...(data.category    !== undefined ? { category:     data.category              } : {}),
    });
  }

  let added      = 0;
  let duplicates: number | undefined;
  if (toImport.length > 0) {
    const result = await onImportTransactions(toImport as ParsedTransaction[]);
    added      = result?.added      ?? toImport.length;
    duplicates = result?.duplicates ?? undefined;
  }

  return {
    added,
    reconciledCount: toUpdate.length,
    invalidCount,
    duplicates,
    validCount: toUpdate.length + toImport.length,
  };
}
