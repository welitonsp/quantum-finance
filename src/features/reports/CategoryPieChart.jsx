// src/components/CategoryPieChart.jsx

import { Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

export default function CategoryPieChart({ transactions }) {
  if (!transactions || transactions.length === 0) {
    return (
      <div className="text-center text-zinc-400 text-sm">
        Sem dados para gráfico
      </div>
    );
  }

  const categoryTotals = {};

  transactions.forEach((t) => {
    const category = t.category || "Sem categoria";
    categoryTotals[category] =
      (categoryTotals[category] || 0) + (t.value || 0);
  });

  const data = {
    labels: Object.keys(categoryTotals),
    datasets: [
      {
        data: Object.values(categoryTotals),
        backgroundColor: [
          "#6366f1",
          "#22c55e",
          "#f97316",
          "#ef4444",
          "#14b8a6",
          "#eab308",
        ],
      },
    ],
  };

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-4 text-center">
        Distribuição por Categoria
      </h2>
      <Pie data={data} />
    </div>
  );
}
