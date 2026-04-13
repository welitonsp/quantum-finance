import { useMemo } from 'react';
import Decimal from 'decimal.js';

export function useFinancialData(transactions, activeModule, currentMonth, currentYear) {
  
  // 1. FILTRAGEM INTELIGENTE DO MÊS
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

  // 2. CÁLCULO DE SALDOS REAIS E PRECISÃO DECIMAL
  const moduleBalances = useMemo(() => {
    if (!transactions) return { geral: { saldo: 0, receitas: 0, despesas: 0, patrimonio: 0, dividas: 0 } };

    let receitasMes = new Decimal(0);
    let despesasMes = new Decimal(0);
    let saldoAcumulado = new Decimal(0);

    transactions.forEach(tx => {
      const txAccount = tx.account || 'conta_corrente';
      if (activeModule !== 'geral' && txAccount !== activeModule) return;

      // 🛡️ DESENCRIPTAR CENTAVOS: Divide por 100 para restabelecer os decimais reais
      const rawVal = Number(tx.value || 0);
      const val = new Decimal(Math.abs(rawVal)).dividedBy(100); 
      
      const isIncome = tx.type === 'entrada' || tx.type === 'receita';

      // ACUMULADO GLOBAL (O verdadeiro Saldo Bancário de todo o histórico baixado)
      if (isIncome) saldoAcumulado = saldoAcumulado.plus(val);
      else saldoAcumulado = saldoAcumulado.minus(val);

      // APENAS DO MÊS SELECIONADO
      const rawDate = tx.date || tx.data || tx.createdAt;
      if (rawDate) {
        let txDate = rawDate.toDate ? rawDate.toDate() : new Date(rawDate);
        if (typeof rawDate === 'string' && !rawDate.includes('T')) {
          const [y, m, d] = rawDate.split('T')[0].split('-');
          txDate = new Date(Number(y), Number(m) - 1, Number(d) || 1);
        }
        if (!isNaN(txDate.getTime()) && txDate.getMonth() + 1 === currentMonth && txDate.getFullYear() === currentYear) {
          if (isIncome) receitasMes = receitasMes.plus(val);
          else despesasMes = despesasMes.plus(val);
        }
      }
    });

    return {
      geral: {
        saldo: saldoAcumulado.toNumber(),
        receitas: receitasMes.toNumber(),
        despesas: despesasMes.toNumber(),
        patrimonio: saldoAcumulado.toNumber(),
        dividas: 0
      }
    };
  }, [transactions, activeModule, currentMonth, currentYear]);

  // 3. AGRUPAMENTO POR CATEGORIAS
  const categoryData = useMemo(() => {
    const map = {};
    displayedTransactions.forEach(tx => {
      if (tx.type === 'saida' || tx.type === 'despesa') {
        const cat = tx.category || 'Diversos';
        const current = map[cat] ? new Decimal(map[cat]) : new Decimal(0);
        // Desencriptar centavos para os gráficos
        const val = new Decimal(Math.abs(Number(tx.value || 0))).dividedBy(100);
        map[cat] = current.plus(val).toNumber();
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

  const topExpensesData = useMemo(() => {
    return [...categoryData].slice(0, 4);
  }, [categoryData]);

  // Enviar a matriz desencriptada de centavos para a UI
  const allTransactionsDecrypted = useMemo(() => {
    return (transactions || []).map(tx => ({
      ...tx,
      value: new Decimal(Number(tx.value || 0)).dividedBy(100).toNumber()
    }));
  }, [transactions]);

  const displayedTransactionsDecrypted = useMemo(() => {
    return (displayedTransactions || []).map(tx => ({
      ...tx,
      value: new Decimal(Number(tx.value || 0)).dividedBy(100).toNumber()
    }));
  }, [displayedTransactions]);

  return { 
    displayedTransactions: displayedTransactionsDecrypted, 
    moduleBalances, 
    categoryData, 
    topExpensesData, 
    allTransactions: allTransactionsDecrypted 
  };
}