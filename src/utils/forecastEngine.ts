// src/utils/forecastEngine.ts
import Decimal from 'decimal.js';

interface FirestoreTimestamp { toDate(): Date }

interface TxForForecast {
  type: string;
  date?: string | number | FirestoreTimestamp;
  createdAt?: string | number | FirestoreTimestamp;
  value?: number | string;
}

interface ChartPoint {
  dia: string;
  real: number | null;
  projetado: number | null;
}

export interface ForecastResult {
  dadosGrafico: ChartPoint[];
  gastoAtual: number;
  projecaoFinal: number;
  ritmoDiario: number;
}

export function calculateForecast(
  transactions: TxForForecast[],
  currentMonth: number,
  currentYear: number,
): ForecastResult {
  const hoje          = new Date();
  const isCurrentMonth = hoje.getMonth() + 1 === currentMonth && hoje.getFullYear() === currentYear;
  const diasNoMes     = new Date(currentYear, currentMonth, 0).getDate();
  const diaAtual      = isCurrentMonth ? hoje.getDate() : diasNoMes;

  const despesas = transactions.filter(t => t.type === 'saida' || t.type === 'despesa');

  const gastosPorDia: Decimal[] = Array(diasNoMes).fill(null).map(() => new Decimal(0));

  despesas.forEach(tx => {
    const rawDate = tx.date ?? tx.createdAt;
    const dataTx = rawDate && typeof rawDate === 'object' && 'toDate' in rawDate
      ? rawDate.toDate()
      : new Date(typeof rawDate === 'string' && !rawDate.includes('T')
          ? `${rawDate}T12:00:00`
          : (rawDate as string | number));
    const dia = dataTx.getDate();
    if (dia >= 1 && dia <= diasNoMes) {
      gastosPorDia[dia - 1] = gastosPorDia[dia - 1].plus(new Decimal(tx.value ?? 0));
    }
  });

  let acumuladoReal = new Decimal(0);
  const chartData: ChartPoint[] = [];

  for (let i = 0; i < diasNoMes; i++) {
    if (i + 1 <= diaAtual) {
      acumuladoReal = acumuladoReal.plus(gastosPorDia[i]);
      chartData.push({ dia: String(i + 1), real: acumuladoReal.toDecimalPlaces(2).toNumber(), projetado: null });
    } else {
      chartData.push({ dia: String(i + 1), real: null, projetado: null });
    }
  }

  const burnRateDiario  = diaAtual > 0 ? acumuladoReal.dividedBy(diaAtual) : new Decimal(0);
  const projecaoFinal   = burnRateDiario.times(diasNoMes);

  if (isCurrentMonth && diaAtual < diasNoMes) {
    chartData[diaAtual - 1].projetado = acumuladoReal.toDecimalPlaces(2).toNumber();
    let acumuladoProjetado = acumuladoReal;
    for (let i = diaAtual; i < diasNoMes; i++) {
      acumuladoProjetado = acumuladoProjetado.plus(burnRateDiario);
      chartData[i].projetado = acumuladoProjetado.toDecimalPlaces(2).toNumber();
    }
  }

  return {
    dadosGrafico: chartData,
    gastoAtual:   acumuladoReal.toNumber(),
    projecaoFinal: projecaoFinal.toNumber(),
    ritmoDiario:  burnRateDiario.toNumber(),
  };
}
