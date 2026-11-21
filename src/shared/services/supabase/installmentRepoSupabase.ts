/**
 * Parcelamentos no Supabase. Todas as parcelas entram num único INSERT
 * (atômico: ou grava o grupo inteiro, ou nada). Histórico CREATE por trigger.
 * O plano (valores, datas, competência) vem de buildInstallmentPlan, a mesma
 * fonte usada no Firebase.
 */
import { getSupabase } from '../../api/supabase/client';
import { logSanitizedFirebaseError } from '../../lib/firebaseErrorHandling';
import type { Transaction } from '../../types/transaction';
import { buildInstallmentPlan, type InstallmentGroupCreateDTO } from '../firestoreCore';
import { mapTransactionRow, TRANSACTION_COLUMNS, type TransactionRow } from './transactionRepoSupabase';

export const installmentRepoSupabase = {
  async createInstallmentGroupWithHistory(uid: string, data: InstallmentGroupCreateDTO): Promise<string> {
    if (!uid) throw new Error('Usuário não autenticado.');
    const plan = buildInstallmentPlan(data);
    const groupId = crypto.randomUUID();
    const total = Math.abs(data.totalValueCents);
    const rows = plan.map(item => ({
      ...(item.index === 1 ? { id: groupId } : {}),
      description: item.description,
      value_cents: item.valueCents,
      type: 'saida',
      category: data.category,
      date: item.date,
      competencia: item.competencia,
      source: 'manual',
      is_recurring: false,
      installment_group_id: groupId,
      installment_index: item.index,
      installment_count: data.installmentCount,
      installment_total_cents: total,
      account_id: data.accountId || null,
      card_id: data.cardId || null,
    }));
    const { error } = await getSupabase().from('transactions').insert(rows);
    if (error) {
      logSanitizedFirebaseError('transaction_add', error);
      throw new Error('Não foi possível salvar o parcelamento.');
    }
    return groupId;
  },

  async getInstallmentGroup(uid: string, groupId: string): Promise<Transaction[]> {
    if (!uid || !groupId) return [];
    const { data, error } = await getSupabase()
      .from('transactions')
      .select(TRANSACTION_COLUMNS)
      .eq('installment_group_id', groupId)
      .is('deleted_at', null)
      .order('installment_index', { ascending: true });
    if (error) {
      logSanitizedFirebaseError('firestore_query', error);
      throw new Error('Não foi possível carregar as parcelas.');
    }
    return ((data ?? []) as unknown as TransactionRow[]).map(mapTransactionRow);
  },

  /** Cancela (exclusão lógica) as parcelas depois de `fromIndex`. Devolve quantas. */
  async cancelRemainingInstallments(uid: string, groupId: string, fromIndex: number): Promise<number> {
    if (!uid || !groupId) return 0;
    const { data, error } = await getSupabase()
      .from('transactions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('installment_group_id', groupId)
      .gt('installment_index', fromIndex)
      .is('deleted_at', null)
      .select('id');
    if (error) {
      logSanitizedFirebaseError('transaction_delete_batch', error);
      throw new Error('Não foi possível cancelar as parcelas.');
    }
    return (data ?? []).length;
  },
};
