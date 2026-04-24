// src/utils/ForecastChart.ts — forecast engine utility
import type { Transaction } from '../shared/types/transaction';
import { isExpense } from './transactionUtils';

interface ChartDataPoint {
  dia:       string;
  real:      number | null;
  projetado: number | null;
}

interface ForecastResult {
  dadosGrafico:  ChartDataPoint[];
  gastoAtual:    number;
  projecaoFinal: number;
  ritmoDiario:   number;
}

export function calculateForecast(
  transactions: Transaction[],
  currentMonth: number,
  currentYear:  number
): ForecastResult {
  const hoje          = new Date();
  const isCurrentMonth = hoje.getMonth() + 1 === currentMonth && hoje.getFullYear() === currentYear;
  const diasNoMes     = new Date(currentYear, currentMonth, 0).getDate();
  const diaAtual      = isCurrentMonth ? hoje.getDate() : diasNoMes;

  const despesas = transactions.filter(t => isExpense(t.type));

  const gastosPorDia = Array<number>(diasNoMes).fill(0);
  despesas.forEach(tx => {
    const dataTx = new Date(tx.date ?? (tx as Transaction & { createdAt?: string }).createdAt ?? '');
    const dia    = dataTx.getDate();
    if (dia >= 1 && dia <= diasNoMes) {
      gastosPorDia[dia - 1] = (gastosPorDia[dia - 1] ?? 0) + Number(tx.value ?? 0);
    }
  });

  let acumuladoReal = 0;
  const chartData: ChartDataPoint[] = [];

  for (let i = 0; i < diasNoMes; i++) {
    const dia = i + 1;
    if (dia <= diaAtual) {
      acumuladoReal += gastosPorDia[i] ?? 0;
      chartData.push({ dia: String(dia), real: Number(acumuladoReal.toFixed(2)), projetado: null });
    } else {
      chartData.push({ dia: String(dia), real: null, projetado: null });
    }
  }

  const burnRateDiario = diaAtual > 0 ? acumuladoReal / diaAtual : 0;
  const projecaoFinal  = burnRateDiario * diasNoMes;

  let acumuladoProjetado = acumuladoReal;
  if (isCurrentMonth && diaAtual < diasNoMes) {
    const lastPoint = chartData[diaAtual - 1];
    if (lastPoint) lastPoint.projetado = Number(acumuladoReal.toFixed(2));
    for (let i = diaAtual; i < diasNoMes; i++) {
      acumuladoProjetado += burnRateDiario;
      const point = chartData[i];
      if (point) point.projetado = Number(acumuladoProjetado.toFixed(2));
    }
  }

  return {
    dadosGrafico:  chartData,
    gastoAtual:    acumuladoReal,
    projecaoFinal,
    ritmoDiario:   burnRateDiario,
  };
}
