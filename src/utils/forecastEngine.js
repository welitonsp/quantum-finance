// src/utils/forecastEngine.js

export function generateForecastData(transactions, currentMonth, currentYear) {
  // 1. Descobrir quantos dias tem o mês selecionado
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const today = new Date();
  
  // Verifica se estamos a olhar para o mês atual ou para o passado
  const isCurrentMonth = today.getMonth() + 1 === currentMonth && today.getFullYear() === currentYear;
  const currentDay = isCurrentMonth ? today.getDate() : daysInMonth;

  // 2. Ordenar as transações do mês cronologicamente
  const sortedTx = [...transactions].sort((a, b) => a.createdAt - b.createdAt);

  // 3. Agrupar entradas e saídas por dia
  const txByDay = {};
  sortedTx.forEach(tx => {
    const day = tx.createdAt.getDate();
    if (!txByDay[day]) txByDay[day] = { entradas: 0, saidas: 0 };
    if (tx.type === 'entrada') txByDay[day].entradas += Number(tx.value);
    if (tx.type === 'saida') txByDay[day].saidas += Number(tx.value);
  });

  let dailyData = [];
  let cumulativeBalance = 0;
  let totalExpensesToDate = 0;

  // 4. Construir a linha do "Passado" (Realidade)
  for (let i = 1; i <= daysInMonth; i++) {
    const dayData = txByDay[i] || { entradas: 0, saidas: 0 };
    cumulativeBalance += (dayData.entradas - dayData.saidas);

    if (i <= currentDay) {
      totalExpensesToDate += dayData.saidas;
      dailyData.push({
        day: i.toString().padStart(2, '0'),
        real: cumulativeBalance, // Linha sólida
        projected: i === currentDay ? cumulativeBalance : null // O ponto de ancoragem
      });
    } else {
      dailyData.push({
        day: i.toString().padStart(2, '0'),
        real: null,
        projected: null 
      });
    }
  }

  // 5. O Algoritmo Preditivo: Calcular a "Velocidade de Gasto" diária (Burn Rate)
  // Ignoramos dias futuros na média.
  const burnRate = currentDay > 0 ? totalExpensesToDate / currentDay : 0;
  let projectedBalance = cumulativeBalance;

  // 6. Construir a linha do "Futuro" (Projeção)
  for (let i = currentDay + 1; i <= daysInMonth; i++) {
    projectedBalance -= burnRate; // Subtrai a média de gastos diária
    dailyData[i - 1].projected = projectedBalance;
  }

  return { 
    chartData: dailyData, 
    burnRate, 
    projectedEndBalance: projectedBalance,
    currentBalance: cumulativeBalance
  };
}