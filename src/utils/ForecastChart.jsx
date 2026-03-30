// src/utils/forecastEngine.js

export function calculateForecast(transactions, currentMonth, currentYear) {
  const hoje = new Date();
  const isCurrentMonth = hoje.getMonth() + 1 === currentMonth && hoje.getFullYear() === currentYear;
  
  const diasNoMes = new Date(currentYear, currentMonth, 0).getDate();
  const diaAtual = isCurrentMonth ? hoje.getDate() : diasNoMes;

  // 1. Isolar apenas as Saídas (Gastos)
  const despesas = transactions.filter(t => t.type === 'saida');

  // 2. Agrupar gastos por dia
  const gastosPorDia = Array(diasNoMes).fill(0);
  despesas.forEach(tx => {
    const dataTx = new Date(tx.date || tx.createdAt);
    const dia = dataTx.getDate();
    // Garante que o dia é válido para o array
    if (dia >= 1 && dia <= diasNoMes) {
      gastosPorDia[dia - 1] += Number(tx.value);
    }
  });

  // 3. Calcular o Acumulado Real (até ao dia de hoje)
  let acumuladoReal = 0;
  const chartData = [];

  for (let i = 0; i < diasNoMes; i++) {
    const dia = i + 1;
    
    if (dia <= diaAtual) {
      acumuladoReal += gastosPorDia[i];
      chartData.push({
        dia: dia.toString(),
        real: Number(acumuladoReal.toFixed(2)),
        projetado: null // O passado não tem projeção, é real
      });
    } else {
      // Dias futuros ficam vazios no array real
      chartData.push({
        dia: dia.toString(),
        real: null,
        projetado: null 
      });
    }
  }

  // 4. Calcular o Burn Rate Diário e a Projeção Futura
  // Se não gastou nada ou estamos no dia 1, a previsão é 0 para evitar erros
  const burnRateDiario = diaAtual > 0 ? acumuladoReal / diaAtual : 0;
  const projecaoFinal = burnRateDiario * diasNoMes;

  // 5. Preencher a linha de Projeção (Tracejada) a partir de hoje até ao fim do mês
  let acumuladoProjetado = acumuladoReal;
  if (isCurrentMonth && diaAtual < diasNoMes) {
    // Liga o último ponto real ao primeiro ponto projetado
    chartData[diaAtual - 1].projetado = Number(acumuladoReal.toFixed(2));
    
    for (let i = diaAtual; i < diasNoMes; i++) {
      acumuladoProjetado += burnRateDiario;
      chartData[i].projetado = Number(acumuladoProjetado.toFixed(2));
    }
  }

  return {
    dadosGrafico: chartData,
    gastoAtual: acumuladoReal,
    projecaoFinal: projecaoFinal,
    ritmoDiario: burnRateDiario
  };
}