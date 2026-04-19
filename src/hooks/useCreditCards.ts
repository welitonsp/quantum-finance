// src/hooks/useCreditCards.ts
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection, query, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../shared/api/firebase/index.js';
import { toCentavos, fromCentavos } from '../shared/schemas/financialSchemas';

type AnyRecord = Record<string, unknown>;

interface CardData extends AnyRecord {
  id: string;
  name?: string;
  limit?: number;
  closingDay?: number;
  dueDay?: number;
}

interface Transaction extends AnyRecord {
  cardId?: string;
  type?: string;
  value?: number;
  date?: string;
  createdAt?: string;
}

type AlertLevel = 'safe' | 'warning' | 'critical';

interface CardMetrics {
  limitVal: number;
  faturaAtual: number;
  disponivel: number;
  compromisso: number;
  daysUntilDue: number;
  isOverLimit: boolean;
  alertLevel: AlertLevel;
}

function calcCardMetrics(card: CardData, transactions: Transaction[]): CardMetrics {
  const hoje     = new Date();
  const diaHoje  = hoje.getDate();
  const closingDay = card.closingDay ?? 1;
  const dueDay     = card.dueDay     ?? 1;

  let inicioFatura: Date, fimFatura: Date;
  if (diaHoje < closingDay) {
    inicioFatura = new Date(hoje.getFullYear(), hoje.getMonth() - 1, closingDay);
    fimFatura    = new Date(hoje.getFullYear(), hoje.getMonth(),     closingDay - 1);
  } else {
    inicioFatura = new Date(hoje.getFullYear(), hoje.getMonth(),     closingDay);
    fimFatura    = new Date(hoje.getFullYear(), hoje.getMonth() + 1, closingDay - 1);
  }

  const faturaAtual = transactions
    .filter(tx => {
      if (tx.cardId !== card.id) return false;
      if (tx.type !== 'saida' && tx.type !== 'despesa') return false;
      const d = new Date((tx.date || tx.createdAt) as string);
      return d >= inicioFatura && d <= fimFatura;
    })
    .reduce((acc, tx) => acc + Math.abs(Number(tx.value || 0)), 0);

  const limitVal    = fromCentavos(card.limit ?? 0);
  const disponivel  = Math.max(limitVal - faturaAtual, 0);
  const compromisso = limitVal > 0 ? Math.min((faturaAtual / limitVal) * 100, 100) : 0;

  let daysUntilDue = dueDay - diaHoje;
  if (daysUntilDue <= 0) {
    const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    daysUntilDue    = diasNoMes - diaHoje + dueDay;
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

export function useCreditCards(uid: string | null | undefined, transactions: Transaction[] = []) {
  const [cards, setCards]     = useState<CardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setCards([]); setLoading(false); return; }

    setLoading(true);
    const ref = collection(db, 'users', uid, 'creditCards');
    const q   = query(ref);

    const unsub = onSnapshot(
      q,
      (snap) => {
        const data: CardData[] = snap.docs.map(d => ({
          ...d.data(),
          id:    d.id,
          limit: (d.data()['limit'] as number) ?? 0,
        }));
        data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setCards(data);
        setLoading(false);
      },
      (err) => {
        console.error('Erro ao ler cartões:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [uid]);

  const cardsWithMetrics = useMemo(() => {
    return cards.map(card => ({ ...card, metrics: calcCardMetrics(card, transactions) }));
  }, [cards, transactions]);

  const addCard = useCallback(async (data: AnyRecord): Promise<string> => {
    if (!uid) throw new Error('Utilizador não autenticado.');
    const ref    = collection(db, 'users', uid, 'creditCards');
    const docRef = await addDoc(ref, {
      ...data,
      limit:     toCentavos(data['limit'] as string | number),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }, [uid]);

  const updateCard = useCallback(async (id: string, data: AnyRecord): Promise<void> => {
    if (!uid || !id) return;
    const payload: AnyRecord = { ...data, updatedAt: serverTimestamp() };
    if (data['limit'] !== undefined) payload['limit'] = toCentavos(data['limit'] as string | number);
    await updateDoc(doc(db, 'users', uid, 'creditCards', id), payload);
  }, [uid]);

  const removeCard = useCallback(async (id: string): Promise<void> => {
    if (!uid || !id) return;
    await deleteDoc(doc(db, 'users', uid, 'creditCards', id));
  }, [uid]);

  return { cards: cardsWithMetrics, loading, addCard, updateCard, removeCard };
}
