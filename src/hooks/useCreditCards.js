// src/hooks/useCreditCards.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../shared/api/firebase/index.js';
import { toCentavos, fromCentavos } from '../shared/schemas/financialSchemas';

/**
 * Calcula métricas em tempo real para um cartão de crédito.
 * @param {Object} card - Dados do cartão (com limit em centavos)
 * @param {Array}  transactions - Todas as transações do utilizador
 * @returns {Object} Métricas calculadas
 */
function calcCardMetrics(card, transactions) {
  const hoje = new Date();
  const diaHoje = hoje.getDate();

  // Determina o período da fatura atual
  // Se hoje < closingDay: fatura ainda aberta (do mês anterior closing até hoje)
  // Se hoje >= closingDay: nova fatura (do closingDay atual até próximo closingDay)
  let inicioFatura, fimFatura;
  if (diaHoje < card.closingDay) {
    // Fatura do mês anterior ao corrente
    const mesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, card.closingDay);
    inicioFatura = mesAnterior;
    fimFatura    = new Date(hoje.getFullYear(), hoje.getMonth(), card.closingDay - 1);
  } else {
    // Fatura do mês corrente
    inicioFatura = new Date(hoje.getFullYear(), hoje.getMonth(), card.closingDay);
    fimFatura    = new Date(hoje.getFullYear(), hoje.getMonth() + 1, card.closingDay - 1);
  }

  // Gastos no cartão durante o período da fatura
  const faturaAtual = transactions
    .filter(tx => {
      if (tx.cardId !== card.id) return false;
      if (tx.type !== 'saida' && tx.type !== 'despesa') return false;
      const d = new Date(tx.date || tx.createdAt);
      return d >= inicioFatura && d <= fimFatura;
    })
    .reduce((acc, tx) => acc + Math.abs(Number(tx.value || 0)), 0);

  const limitVal      = fromCentavos(card.limit);
  const disponivel    = Math.max(limitVal - faturaAtual, 0);
  const compromisso   = limitVal > 0 ? Math.min((faturaAtual / limitVal) * 100, 100) : 0;

  // Dias até o vencimento
  let daysUntilDue = card.dueDay - diaHoje;
  if (daysUntilDue <= 0) {
    // Já passou — próximo mês
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

export function useCreditCards(uid, transactions = []) {
  const [cards, setCards]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setCards([]); setLoading(false); return; }

    setLoading(true);
    const ref = collection(db, 'users', uid, 'creditCards');
    const q   = query(ref);

    const unsub = onSnapshot(q,
      (snap) => {
        const data = snap.docs.map(d => ({
          ...d.data(),
          id:    d.id,
          limit: d.data().limit ?? 0,
        }));
        data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setCards(data);
        setLoading(false);
      },
      (err) => {
        console.error('❌ Erro ao ler cartões:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [uid]);

  // Métricas calculadas por cartão (reavaliadas quando transactions mudam)
  const cardsWithMetrics = useMemo(() => {
    return cards.map(card => ({
      ...card,
      metrics: calcCardMetrics(card, transactions),
    }));
  }, [cards, transactions]);

  const addCard = useCallback(async (data) => {
    if (!uid) throw new Error('Utilizador não autenticado.');
    const ref = collection(db, 'users', uid, 'creditCards');
    const docRef = await addDoc(ref, {
      ...data,
      limit:      toCentavos(data.limit),
      createdAt:  serverTimestamp(),
      updatedAt:  serverTimestamp(),
    });
    return docRef.id;
  }, [uid]);

  const updateCard = useCallback(async (id, data) => {
    if (!uid || !id) return;
    const payload = { ...data, updatedAt: serverTimestamp() };
    if (data.limit !== undefined) payload.limit = toCentavos(data.limit);
    await updateDoc(doc(db, 'users', uid, 'creditCards', id), payload);
  }, [uid]);

  const removeCard = useCallback(async (id) => {
    if (!uid || !id) return;
    await deleteDoc(doc(db, 'users', uid, 'creditCards', id));
  }, [uid]);

  return { cards: cardsWithMetrics, loading, addCard, updateCard, removeCard };
}
