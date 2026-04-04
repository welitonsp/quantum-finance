import Decimal from 'decimal.js';

export function calculateForecast(transactions, currentMonth, currentYear) {
  const hoje = new Date();
  const isCurrentMonth = hoje.getMonth() + 1 === currentMonth && hoje.getFullYear() === currentYear;
  const diasNoMes = new Date(currentYear, currentMonth, 0).getDate();
  const diaAtual = isCurrentMonth ? hoje.getDate() : diasNoMes;

  const despesas = transactions.filter(t => t.type === 'saida' || t.type === 'despesa');

  const gastosPorDia = Array(diasNoMes).fill(null).map(() => new Decimal(0));
  
  despesas.forEach(tx => {
    const rawDate = tx.date || tx.createdAt;
    
    const dataTx = rawDate?.toDate 
      ? rawDate.toDate() 
      : new Date(typeof rawDate === 'string' && !rawDate.includes('T') 
          ? `${rawDate}T12:00:00` 
          : rawDate);
          
    const dia = dataTx.getDate();
    
    if (dia >= 1 && dia <= diasNoMes) {
      gastosPorDia[dia - 1] = gastosPorDia[dia - 1].plus(new Decimal(tx.value || 0));
    }
  });

  let acumuladoReal = new Decimal(0);
  const chartData = [];

  for (let i = 0; i < diasNoMes; i++) {
    const dia = i + 1;
    if (dia <= diaAtual) {
      acumuladoReal = acumuladoReal.plus(gastosPorDia[i]);
      chartData.push({ 
        dia: String(dia), 
        real: acumuladoReal.toDecimalPlaces(2).toNumber(), 
        projetado: null 
      });
    } else {
      chartData.push({ dia: String(dia), real: null, projetado: null });
    }
  }

  const burnRateDiario = diaAtual > 0 ? acumuladoReal.dividedBy(diaAtual) : new Decimal(0);
  const projecaoFinal = burnRateDiario.times(diasNoMes);

  let acumuladoProjetado = acumuladoReal;
  if (isCurrentMonth && diaAtual < diasNoMes) {
    chartData[diaAtual - 1].projetado = acumuladoReal.toDecimalPlaces(2).toNumber();
    for (let i = diaAtual; i < diasNoMes; i++) {
      acumuladoProjetado = acumuladoProjetado.plus(burnRateDiario);
      chartData[i].projetado = acumuladoProjetado.toDecimalPlaces(2).toNumber();
    }
  }

  return {
    dadosGrafico: chartData,
    gastoAtual:     acumuladoReal.toNumber(),
    projecaoFinal:  projecaoFinal.toNumber(),
    ritmoDiario:    burnRateDiario.toNumber()
  };
}