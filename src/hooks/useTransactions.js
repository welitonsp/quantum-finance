// src/hooks/useTransactions.js
import { useEffect, useState, useMemo, useCallback } from "react";
import { collection, onSnapshot, query, orderBy, where } from "firebase/firestore";
import { db } from "../firebase";
import { FirestoreService } from "../services/FirestoreService";

export function useTransactions(uid, month, year) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // BLINDAGEM: Só executa se todos os dados de busca existirem
    if (!uid || month === undefined || year === undefined) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    
    // Criamos as datas de início e fim do mês com segurança
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    const q = query(
      collection(db, "users", uid, "transactions"),
      where("createdAt", ">=", startOfMonth),
      where("createdAt", "<=", endOfMonth),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      }));
      setTransactions(data);
      setLoading(false);
    }, (error) => {
      console.error("Erro no Snapshot:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [uid, month, year]);

  const saldos = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    transactions.forEach((t) => {
      if (t.type === "entrada") entradas += t.value;
      else saidas += t.value;
    });
    const saldoAtual = entradas - saidas;
    return { entradas, saidas, saldoAtual, saldoPrevisto: saldoAtual };
  }, [transactions]);

  const add = useCallback(async (data) => {
    if (!uid) return;
    return await FirestoreService.addTransaction(uid, data);
  }, [uid]);

  const remove = useCallback(async (id) => {
    if (!uid) return;
    if (!window.confirm("Apagar esta transação?")) return;
    await FirestoreService.deleteTransaction(uid, id);
  }, [uid]);

  const update = useCallback(async (id, data) => {
    if (!uid) return;
    await FirestoreService.updateTransaction(uid, id, data);
  }, [uid]);

  return { transactions, loading, saldos, add, remove, update };
}