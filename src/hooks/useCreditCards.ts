import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import { toCentavos, fromCentavos } from '../shared/schemas/financialSchemas';
import type { CreditCard, CreditCardWithMetrics, CardMetrics, Transaction } from '../shared/types/transaction';

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

  const faturaAtual = transactions
    .filter(tx => {
      if (tx.cardId !== card.id) return false;
      if (tx.type !== 'saida' && tx.type !== 'despesa') return false;
      const d = new Date(String(tx.date || tx.createdAt));
      return d >= inicioFatura && d <= fimFatura;
    })
    .reduce((acc, tx) => acc + Math.abs(Number(tx.value || 0)), 0);

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
    disponivel,
    compromisso,
    daysUntilDue,
    isOverLimit: faturaAtual > limitVal,
    alertLevel:  compromisso >= 90 ? 'critical' : compromisso >= 70 ? 'warning' : 'safe',
  };
}

interface UseCreditCardsReturn {
  cards: CreditCardWithMetrics[];
  loading: boolean;
  addCard: (data: Omit<CreditCard, 'id'>) => Promise<string>;
  updateCard: (id: string, data: Partial<CreditCard>) => Promise<void>;
  removeCard: (id: string) => Promise<void>;
}

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
      (err) => { console.error('❌ Erro ao ler cartões:', err); setLoading(false); }
    );

    return () => unsub();
  }, [uid]);

  const cardsWithMetrics = useMemo((): CreditCardWithMetrics[] => {
    return cards.map(card => ({ ...card, metrics: calcCardMetrics(card, transactions) }));
  }, [cards, transactions]);

  const addCard = useCallback(async (data: Omit<CreditCard, 'id'>): Promise<string> => {
    if (!uid) throw new Error('Utilizador não autenticado.');
    const ref = collection(db, 'users', uid, 'creditCards');
    const docRef = await addDoc(ref, {
      ...data,
      limit:     toCentavos(data.limit),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }, [uid]);

  const updateCard = useCallback(async (id: string, data: Partial<CreditCard>): Promise<void> => {
    if (!uid || !id) return;
    const payload: Record<string, unknown> = { ...data, updatedAt: serverTimestamp() };
    if (data.limit !== undefined) payload['limit'] = toCentavos(data.limit);
    await updateDoc(doc(db, 'users', uid, 'creditCards', id), payload);
  }, [uid]);

  const removeCard = useCallback(async (id: string): Promise<void> => {
    if (!uid || !id) return;
    await deleteDoc(doc(db, 'users', uid, 'creditCards', id));
  }, [uid]);

  return { cards: cardsWithMetrics, loading, addCard, updateCard, removeCard };
}
