import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import { logSanitizedFirebaseError } from '../shared/lib/firebaseErrorHandling';
import { toCentavos, fromCentavos } from '../shared/schemas/financialSchemas';
import { transactionRepo } from '../shared/services/transactionRepo';
import { projectCardInvoices } from '../lib/cardProjection';
import type { CreditCard, CreditCardWithMetrics, CardMetrics, Transaction } from '../shared/types/transaction';
import type { MoneyInput, Centavos } from '../shared/types/money';
import { getTransactionAbsCentavos, isExpense } from '../utils/transactionUtils';

function calcCardMetrics(card: CreditCard, transactions: Transaction[]): CardMetrics {
  const hoje     = new Date();
  const diaHoje  = hoje.getDate();

  let inicioFatura: Date, fimFatura: Date;
  if (diaHoje < card.closingDay) {
    inicioFatura = new Date(hoje.getFullYear(), hoje.getMonth() - 1, card.closingDay);
    fimFatura    = new Date(hoje.getFullYear(), hoje.getMonth(), card.closingDay - 1);
  } else {
    inicioFatura = new Date(hoje.getFullYear(), hoje.getMonth(), card.closingDay);
    fimFatura    = new Date(hoje.getFullYear(), hoje.getMonth() + 1, card.closingDay - 1);
  }

  const toYMD = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const inicioStr = toYMD(inicioFatura);
  const fimStr    = toYMD(fimFatura);

  // YYYY-MM do início do período de faturamento atual — usado para identificar pagamentos deste período.
  const currentInvoiceMonth = `${inicioFatura.getFullYear()}-${String(inicioFatura.getMonth() + 1).padStart(2, '0')}`;

  const billingTxs = transactions.filter(tx => {
    if (tx.cardId !== card.id) return false;
    if (!isExpense(tx.type)) return false;
    if (tx.paidInvoiceMonth !== undefined) return false; // pagamentos não são cobranças
    const txDate = String(tx.date || tx.createdAt).slice(0, 10);
    return txDate >= inicioStr && txDate <= fimStr;
  });

  const chargesCents = billingTxs.reduce(
    (acc, tx) => (acc + getTransactionAbsCentavos(tx)) as Centavos,
    0 as Centavos,
  );

  // Pagamentos registrados para este período de faturamento reduzem a fatura líquida.
  const paymentsCents = transactions
    .filter(tx =>
      tx.cardId === card.id &&
      tx.paidInvoiceMonth === currentInvoiceMonth &&
      tx.isDeleted !== true &&
      !tx.deletedAt,
    )
    .reduce((acc, tx) => (acc + getTransactionAbsCentavos(tx)) as Centavos, 0 as Centavos);

  const faturaCents = Math.max(0, chargesCents - paymentsCents) as Centavos;
  const faturaAtual = fromCentavos(faturaCents);

  const limitCents     = (card.limit ?? 0) as Centavos;
  const limitVal       = fromCentavos(limitCents);
  const disponivelCents = Math.max(limitCents - faturaCents, 0) as Centavos;
  const disponivel     = fromCentavos(disponivelCents);
  const compromisso    = limitCents > 0 ? Math.min((faturaCents / limitCents) * 100, 100) : 0;

  let daysUntilDue = card.dueDay - diaHoje;
  if (daysUntilDue <= 0) {
    const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    daysUntilDue = diasNoMes - diaHoje + card.dueDay;
  }

  // FASE C — projeção de faturas futuras + limite efetivo (crédito rotativo real).
  // A fatura atual permanece a fonte autoritativa do período corrente; o motor
  // puro adiciona o comprometimento das parcelas futuras já lançadas.
  const projection = projectCardInvoices({
    cardId:           card.id,
    closingDay:       card.closingDay,
    limitCents,
    transactions,
    referenceDateISO: toYMD(hoje),
  });
  const committedFutureCents = projection.committedFutureCents;
  const openTotalCents = (faturaCents + committedFutureCents) as Centavos;
  const effectiveAvailableCents = Math.max(0, limitCents - openTotalCents) as Centavos;

  return {
    limitVal,
    faturaAtual,
    faturaCents,
    limitCents,
    disponivelCents,
    disponivel,
    compromisso,
    daysUntilDue,
    isOverLimit: faturaAtual > limitVal,
    alertLevel:  compromisso >= 90 ? 'critical' : compromisso >= 70 ? 'warning' : 'safe',
    committedFutureCents,
    openTotalCents,
    effectiveAvailableCents,
    futureInvoices: projection.futureInvoices.map(f => ({ competencia: f.competencia, netCents: f.netCents })),
  };
}

interface UseCreditCardsReturn {
  cards: CreditCardWithMetrics[];
  /** Soma das faturas líquidas (cobranças − pagamentos) de todos os cartões em centavos inteiros. */
  totalFaturaCents: import('../shared/types/money').Centavos;
  loading: boolean;
  addCard: (data: CreditCardWriteInput) => Promise<string>;
  updateCard: (id: string, data: CreditCardUpdateInput) => Promise<void>;
  removeCard: (id: string) => Promise<void>;
  /** Registra o pagamento da fatura de um cartão a partir de uma conta bancária. */
  payInvoice: (cardId: string, amountCents: Centavos, fromAccountId: string) => Promise<void>;
}

type CreditCardWriteInput = Omit<CreditCard, 'id' | 'limit'> & {
  limit: MoneyInput;
};

type CreditCardUpdateInput = Partial<Omit<CreditCard, 'limit'>> & {
  limit?: MoneyInput;
};

export function useCreditCards(uid: string, transactions: Transaction[] = []): UseCreditCardsReturn {
  const [cards, setCards]     = useState<CreditCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setCards([]); setLoading(false); return; }

    setLoading(true);
    const ref = collection(db, 'users', uid, 'creditCards');
    const q   = query(ref);

    const unsub = onSnapshot(q,
      (snap) => {
        const data: CreditCard[] = snap.docs.map(d => ({
          ...(d.data() as Omit<CreditCard, 'id'>),
          id:    d.id,
          limit: (d.data()['limit'] as number) ?? 0,
        }));
        data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setCards(data);
        setLoading(false);
      },
      (err) => { logSanitizedFirebaseError('credit_cards_load', err); setLoading(false); }
    );

    return () => unsub();
  }, [uid]);

  const cardsWithMetrics = useMemo((): CreditCardWithMetrics[] => {
    return cards.map(card => ({ ...card, metrics: calcCardMetrics(card, transactions) }));
  }, [cards, transactions]);

  const addCard = useCallback(async (data: CreditCardWriteInput): Promise<string> => {
    if (!uid) throw new Error('Utilizador não autenticado.');
    const ref = collection(db, 'users', uid, 'creditCards');
    const docRef = await addDoc(ref, {
      ...data,
      limit:     toCentavos(data.limit),
      active:    data.active ?? true,
      schemaVersion: 2,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }, [uid]);

  const updateCard = useCallback(async (id: string, data: CreditCardUpdateInput): Promise<void> => {
    if (!uid || !id) return;
    const payload: Record<string, unknown> = { ...data, updatedAt: serverTimestamp() };
    if (data.limit !== undefined) payload['limit'] = toCentavos(data.limit);
    payload['schemaVersion'] = 2;
    await updateDoc(doc(db, 'users', uid, 'creditCards', id), payload);
  }, [uid]);

  const removeCard = useCallback(async (id: string): Promise<void> => {
    if (!uid || !id) return;
    await deleteDoc(doc(db, 'users', uid, 'creditCards', id));
  }, [uid]);

  const payInvoice = useCallback(async (
    cardId: string,
    amountCents: Centavos,
    fromAccountId: string,
  ): Promise<void> => {
    if (!uid) throw new Error('Utilizador não autenticado.');
    if (amountCents <= 0) throw new Error('Valor de pagamento deve ser positivo.');

    const card = cards.find(c => c.id === cardId);
    const cardName = card?.name ?? 'Cartão';

    // Calcula o YYYY-MM do período de faturamento atual para este cartão.
    const hoje = new Date();
    const diaHoje = hoje.getDate();
    const closingDay = card?.closingDay ?? 1;
    let invYear = hoje.getFullYear();
    let invMonth = hoje.getMonth() + 1;
    if (diaHoje < closingDay) {
      invMonth -= 1;
      if (invMonth < 1) { invMonth = 12; invYear -= 1; }
    }
    const invoiceMonth = `${invYear}-${String(invMonth).padStart(2, '0')}`;

    await transactionRepo.createManualTransactionWithHistory(uid, {
      description:      `Pagamento fatura ${cardName}`,
      value_cents:      amountCents,
      type:             'saida',
      category:         'Outros',
      date:             hoje.toLocaleDateString('sv-SE'),
      source:           'manual',
      cardId,
      accountId:        fromAccountId,
      paidInvoiceMonth: invoiceMonth,
      isRecurring:      false,
    });
  }, [uid, cards]);

  const totalFaturaCents = useMemo(
    () => cardsWithMetrics.reduce(
      (sum, c) => (sum + c.metrics.faturaCents) as import('../shared/types/money').Centavos,
      0 as import('../shared/types/money').Centavos,
    ),
    [cardsWithMetrics],
  );

  return { cards: cardsWithMetrics, totalFaturaCents, loading, addCard, updateCard, removeCard, payInvoice };
}
