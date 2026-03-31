// src/hooks/useFinancialData.js
import { useMemo } from 'react';

export function useFinancialData(transactions, activeModule, currentMonth, currentYear) {
  
  // 1. FILTRAGEM INTELIGENTE
  const displayedTransactions = useMemo(() => {
    if (!transactions) return [];
    
    return transactions.filter(t => {
      // Filtro de Módulo (Conta Corrente vs Cartão)
      const txAccount = t.account || 'conta_corrente';
      if (activeModule !== 'geral' && txAccount !== activeModule) return false;

      // Filtro de Data
      const rawDate = t.date || t.data || t.createdAt;
      if (!rawDate) return false;

      let txDate = rawDate.toDate ? rawDate.toDate() : new Date(rawDate);
      if (typeof rawDate === 'string' && !rawDate.includes('T')) {
        const [y, m, d] = rawDate.split('T')[0].split('-');
        txDate = new Date(Number(y), Number(m) - 1, Number(d) || 1);
      }
      
      return !isNaN(txDate.getTime()) && 
             (txDate.getMonth() + 1 === currentMonth) && 
             (txDate.getFullYear() === currentYear);
    });
  }, [transactions, activeModule, currentMonth, currentYear]);

  // 2. CÁLCULO DE SALDOS
  const moduleBalances = useMemo(() => {
    const balances = displayedTransactions.reduce((acc, tx) => {
      if (tx.type === 'entrada') acc.entradas += Number(tx.value);
      if (tx.type === 'saida') acc.saidas += Number(tx.value);
      return acc;
    }, { entradas: 0, saidas: 0, saldoAtual: 0 });
    
    balances.saldoAtual = balances.entradas - balances.saidas;
    return balances;
  }, [displayedTransactions]);

  // 3. AGRUPAMENTO POR CATEGORIAS (Para os Gráficos)
  const categoryData = useMemo(() => {
    const map = {};
    displayedTransactions.forEach(tx => {
      if (tx.type === 'saida') {
        const cat = tx.category || 'Diversos';
        map[cat] = (map[cat] || 0) + Math.abs(Number(tx.value));
      }
    });
    
    const colors = ['#ef4444', '#06b6d4', '#a855f7', '#f59e0b', '#10b981', '#3b82f6'];
    return Object.keys(map)
      .map((key, i) => ({ name: key, value: map[key], color: colors[i % colors.length] }))
      .sort((a, b) => b.value - a.value);
  }, [displayedTransactions]);

  const topExpensesData = useMemo(() => categoryData.slice(0, 4), [categoryData]);

  return { displayedTransactions, moduleBalances, categoryData, topExpensesData };
}