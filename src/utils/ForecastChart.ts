// src/utils/ForecastChart.ts — forecast engine utility
import type { Transaction } from '../shared/types/transaction';
import { getTransactionAbsCentavos, isExpense } from './transactionUtils';
import { fromCentavos } from '../shared/types/money';

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
  currentYear:  number,
  now: Date = new Date(),
): ForecastResult {
  const hoje          = now;
  const isCurrentMonth = hoje.getMonth() + 1 === currentMonth && hoje.getFullYear() === currentYear;
  const diasNoMes     = new Date(currentYear, currentMonth, 0).getDate();
  const diaAtual      = isCurrentMonth ? hoje.getDate() : diasNoMes;

  const despesas = transactions.filter(t => isExpense(t.type));

  const gastosPorDia = Array<number>(diasNoMes).fill(0);
  despesas.forEach(tx => {
    const dataTx = new Date(tx.date ?? (tx as Transaction & { createdAt?: string }).createdAt ?? '');
    const dia    = dataTx.getDate();
    if (dia >= 1 && dia <= diasNoMes) {
      gastosPorDia[dia - 1] = (gastosPorDia[dia - 1] ?? 0) + getTransactionAbsCentavos(tx);
    }
  });

  let acumuladoReal = 0;
  const chartData: ChartDataPoint[] = [];

  for (let i = 0; i < diasNoMes; i++) {
    const dia = i + 1;
    if (dia <= diaAtual) {
      acumuladoReal += gastosPorDia[i] ?? 0;
      chartData.push({ dia: String(dia), real: fromCentavos(Math.round(acumuladoReal)), projetado: null });
    } else {
      chartData.push({ dia: String(dia), real: null, projetado: null });
    }
  }

  const burnRateDiario = diaAtual > 0 ? acumuladoReal / diaAtual : 0;
  const projecaoFinal  = burnRateDiario * diasNoMes;

  let acumuladoProjetado = acumuladoReal;
  if (isCurrentMonth && diaAtual < diasNoMes) {
    const lastPoint = chartData[diaAtual - 1];
    if (lastPoint) lastPoint.projetado = fromCentavos(Math.round(acumuladoReal));
    for (let i = diaAtual; i < diasNoMes; i++) {
      acumuladoProjetado += burnRateDiario;
      const point = chartData[i];
      if (point) point.projetado = fromCentavos(Math.round(acumuladoProjetado));
    }
  }

  return {
    dadosGrafico:  chartData,
    gastoAtual:    fromCentavos(Math.round(acumuladoReal)),
    projecaoFinal: fromCentavos(Math.round(projecaoFinal)),
    ritmoDiario:   fromCentavos(Math.round(burnRateDiario)),
  };
}
