// src/hooks/useFinancialMetrics.js
import { useMemo } from 'react';
import Decimal from 'decimal.js'; // ✅ PRECISÃO BANCÁRIA
import { useAccounts } from './useAccounts';
import { useRecurring } from './useRecurring';

export function useFinancialMetrics(uid, transactions, currentMonth, currentYear) {
  const { accounts, loadingAccounts } = useAccounts(uid);
  const { recurring, loadingRecurring } = useRecurring(uid);

  const metrics = useMemo(() => {
    let receita = new Decimal(0);
    let despesa = new Decimal(0);

    if (transactions) {
      transactions.forEach(tx => {
        const txDate = new Date(tx.date || tx.createdAt);
        if (txDate.getMonth() + 1 === currentMonth && txDate.getFullYear() === currentYear) {
          const val = new Decimal(tx.value || 0);
          if (tx.type === 'receita' || tx.type === 'entrada') receita = receita.plus(val);
          if (tx.type === 'saida' || tx.type === 'despesa') despesa = despesa.plus(val);
        }
      });
    }

    let ativos = new Decimal(0);
    let passivos = new Decimal(0);
    
    accounts.forEach(acc => {
      const val = new Decimal(acc.balance || 0);
      if (['corrente', 'poupanca', 'investimento'].includes(acc.type)) ativos = ativos.plus(val);
      if (['cartao', 'divida'].includes(acc.type)) passivos = passivos.plus(val.abs());
    });
    
    const patrimonioLiquido = ativos.minus(passivos);
    const patrimonioBruto = ativos.plus(passivos);

    let custoFixoMensal = new Decimal(0);
    recurring.forEach(item => {
      if (item.active) {
        const val = new Decimal(item.value || 0);
        if (item.frequency === 'mensal') custoFixoMensal = custoFixoMensal.plus(val);
        if (item.frequency === 'anual') custoFixoMensal = custoFixoMensal.plus(val.dividedBy(12));
      }
    });

    const taxaPoupanca = receita.greaterThan(0) ? receita.minus(despesa).dividedBy(receita).times(100) : new Decimal(0);
    const endividamento = patrimonioBruto.greaterThan(0) ? passivos.dividedBy(patrimonioBruto).times(100) : new Decimal(0);
    const comprometimento = receita.greaterThan(0) ? custoFixoMensal.dividedBy(receita).times(100) : new Decimal(0);
    
    const gastoMensalMedio = despesa.greaterThan(custoFixoMensal) ? despesa : (custoFixoMensal.greaterThan(0) ? custoFixoMensal : new Decimal(1));
    const reservaMeses = ativos.dividedBy(gastoMensalMedio);

    return {
      receita: receita.toNumber(), 
      despesa: despesa.toNumber(), 
      ativos: ativos.toNumber(), 
      passivos: passivos.toNumber(), 
      patrimonioLiquido: patrimonioLiquido.toNumber(), 
      custoFixoMensal: custoFixoMensal.toNumber(),
      taxaPoupanca: taxaPoupanca.toNumber(), 
      endividamento: endividamento.toNumber(), 
      comprometimento: comprometimento.toNumber(), 
      reservaMeses: reservaMeses.toNumber()
    };
  }, [transactions, accounts, recurring, currentMonth, currentYear]);

  return { metrics, loadingMetrics: loadingAccounts || loadingRecurring };
}