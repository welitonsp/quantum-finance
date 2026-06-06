import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import { logSanitizedFirebaseError } from '../shared/lib/firebaseErrorHandling';
import { toCentavos, fromCentavos } from '../shared/schemas/financialSchemas';
import type { CreditCard, CreditCardWithMetrics, CardMetrics, Transaction } from '../shared/types/transaction';
import type { MoneyInput } from '../shared/types/money';
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

  const billingTxs = transactions.filter(tx => {
    if (tx.cardId !== card.id) return false;
    if (!isExpense(tx.type)) return false;
    const txDate = String(tx.date || tx.createdAt).slice(0, 10);
    return txDate >= inicioStr && txDate <= fimStr;
  });

  const faturaCents = billingTxs.reduce(
    (acc, tx) => (acc + getTransactionAbsCentavos(tx)) as ReturnType<typeof getTransactionAbsCentavos>,
    0 as ReturnType<typeof getTransactionAbsCentavos>,
  );
  const faturaAtual = fromCentavos(faturaCents);

  const limitVal    = fromCentavos(card.limit);
  const disponivel  = Math.max(limitVal - faturaAtual, 0);
  const compromisso = limitVal > 0 ? Math.min((faturaAtual / limitVal) * 100, 100) : 0;

  let daysUntilDue = card.dueDay - diaHoje;
  if (daysUntilDue <= 0) {
    const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    daysUntilDue = diasNoMes - diaHoje + card.dueDay;
  }

  return {
    limitVal,
    faturaAtual,
    faturaCents,
    disponivel,
    compromisso,
    daysUntilDue,
    isOverLimit: faturaAtual > limitVal,
    alertLevel:  compromisso >= 90 ? 'critical' : compromisso >= 70 ? 'warning' : 'safe',
  };
}

interface UseCreditCardsReturn {
  cards: CreditCardWithMetrics[];
  /** Soma das faturas abertas de todos os cartões em centavos inteiros. */
  totalFaturaCents: import('../shared/types/money').Centavos;
  loading: boolean;
  addCard: (data: CreditCardWriteInput) => Promise<string>;
  updateCard: (id: string, data: CreditCardUpdateInput) => Promise<void>;
  removeCard: (id: string) => Promise<void>;
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

  const totalFaturaCents = useMemo(
    () => cardsWithMetrics.reduce(
      (sum, c) => (sum + c.metrics.faturaCents) as import('../shared/types/money').Centavos,
      0 as import('../shared/types/money').Centavos,
    ),
    [cardsWithMetrics],
  );

  return { cards: cardsWithMetrics, totalFaturaCents, loading, addCard, updateCard, removeCard };
}
