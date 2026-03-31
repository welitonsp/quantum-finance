// src/hooks/useFinancialMetrics.js
import { useMemo } from 'react';
import { useAccounts } from './useAccounts';
import { useRecurring } from './useRecurring';

export function useFinancialMetrics(uid, transactions, currentMonth, currentYear) {
  const { accounts, loadingAccounts } = useAccounts(uid);
  const { recurring, loadingRecurring } = useRecurring(uid);

  const metrics = useMemo(() => {
    let receita = 0;
    let despesa = 0;

    if (transactions) {
      transactions.forEach(tx => {
        const txDate = new Date(tx.date || tx.createdAt);
        if (txDate.getMonth() + 1 === currentMonth && txDate.getFullYear() === currentYear) {
          if (tx.type === 'receita' || tx.type === 'entrada') receita += Number(tx.value);
          if (tx.type === 'saida' || tx.type === 'despesa') despesa += Math.abs(Number(tx.value));
        }
      });
    }

    let ativos = 0;
    let passivos = 0;
    accounts.forEach(acc => {
      const val = Number(acc.balance);
      if (['corrente', 'poupanca', 'investimento'].includes(acc.type)) ativos += val;
      if (['cartao', 'divida'].includes(acc.type)) passivos += Math.abs(val);
    });
    
    const patrimonioLiquido = ativos - passivos;
    const patrimonioBruto = ativos + passivos;

    let custoFixoMensal = 0;
    recurring.forEach(item => {
      if (item.active) {
        const val = Number(item.value);
        if (item.frequency === 'mensal') custoFixoMensal += val;
        if (item.frequency === 'anual') custoFixoMensal += (val / 12);
      }
    });

    const taxaPoupanca = receita > 0 ? ((receita - despesa) / receita) * 100 : 0;
    const endividamento = patrimonioBruto > 0 ? (passivos / patrimonioBruto) * 100 : 0;
    const comprometimento = receita > 0 ? (custoFixoMensal / receita) * 100 : 0;
    
    const gastoMensalMedio = despesa > custoFixoMensal ? despesa : (custoFixoMensal || 1);
    const reservaMeses = ativos / gastoMensalMedio;

    return {
      receita, 
      despesa, 
      ativos, 
      passivos, 
      patrimonioLiquido, 
      custoFixoMensal,
      taxaPoupanca, 
      endividamento, 
      comprometimento, 
      reservaMeses
    };
  }, [transactions, accounts, recurring, currentMonth, currentYear]);

  return { metrics, loadingMetrics: loadingAccounts || loadingRecurring };
}