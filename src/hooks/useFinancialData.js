// src/hooks/useFinancialData.js
import { useMemo } from 'react';
import Decimal from 'decimal.js'; // ✅ PRECISÃO BANCÁRIA

export function useFinancialData(transactions, activeModule, currentMonth, currentYear) {
  
  // 1. FILTRAGEM INTELIGENTE (Inalterada)
  const displayedTransactions = useMemo(() => {
    if (!transactions) return [];
    
    return transactions.filter(t => {
      const txAccount = t.account || 'conta_corrente';
      if (activeModule !== 'geral' && txAccount !== activeModule) return false;

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

  // 2. CÁLCULO DE SALDOS SEGUROS
  const moduleBalances = useMemo(() => {
    const balances = displayedTransactions.reduce((acc, tx) => {
      const val = new Decimal(tx.value || 0);
      if (tx.type === 'entrada' || tx.type === 'receita') acc.entradas = acc.entradas.plus(val);
      if (tx.type === 'saida' || tx.type === 'despesa') acc.saidas = acc.saidas.plus(val);
      return acc;
    }, { entradas: new Decimal(0), saidas: new Decimal(0) });
    
    return {
      entradas: balances.entradas.toNumber(),
      saidas: balances.saidas.toNumber(),
      saldoAtual: balances.entradas.minus(balances.saidas).toNumber()
    };
  }, [displayedTransactions]);

  // 3. AGRUPAMENTO POR CATEGORIAS (Para Gráficos)
  const categoryData = useMemo(() => {
    const map = {};
    displayedTransactions.forEach(tx => {
      if (tx.type === 'saida' || tx.type === 'despesa') {
        const cat = tx.category || 'Diversos';
        const current = map[cat] ? new Decimal(map[cat]) : new Decimal(0);
        map[cat] = current.plus(new Decimal(tx.value || 0)).toNumber();
      }
    });
    
    const colors = ['#ef4444', '#06b6d4', '#a855f7', '#f59e0b', '#10b981', '#3b82f6', '#f43f5e'];
    const data = Object.keys(map).map((name, idx) => ({
      name,
      value: map[name],
      color: colors[idx % colors.length]
    })).sort((a, b) => b.value - a.value);

    return data;
  }, [displayedTransactions]);

  // 4. TOP DESPESAS
  const topExpensesData = useMemo(() => {
    return [...categoryData].slice(0, 4);
  }, [categoryData]);

  return { displayedTransactions, moduleBalances, categoryData, topExpensesData };
}