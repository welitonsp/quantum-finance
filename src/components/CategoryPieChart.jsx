// src/components/CategoryPieChart.jsx

import { Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

export default function CategoryPieChart({ data }) {
  const labels = Object.keys(data);
  const values = Object.values(data);

  if (labels.length === 0) {
    return (
      <div className="text-zinc-400 text-sm">
        Nenhum dado para exibir no gráfico.
      </div>
    );
  }

  const chartData = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: [
          "#ef4444",
          "#f97316",
          "#22c55e",
          "#3b82f6",
          "#a855f7",
          "#ec4899",
          "#14b8a6",
          "#eab308",
        ],
      },
    ],
  };

  return <Pie data={chartData} />;
}
