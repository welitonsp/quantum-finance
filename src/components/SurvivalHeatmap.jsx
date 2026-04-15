/**
 * SurvivalHeatmap.jsx — Mapa de Calor de Sobrevivência Financeira
 * ──────────────────────────────────────────────────────────────────────────────
 * Grid tipo GitHub Contributions para o mês corrente.
 * Cada célula representa um dia; a cor codifica o nível de gasto relativo
 * à média diária do mês (Behavioral Economics — padrão imediato).
 *
 * ESCALA DE RISCO:
 *   Dia sem gasto     → slate-800/60   "Dia Limpo"
 *   < 0.5× média      → emerald-500/80 "Baixo"
 *   0.5× – <1.0×      → green-400/80   "Normal"
 *   1.0× – <1.8×      → yellow-400/80  "Médio"
 *   ≥ 1.8×            → red-500/80     "Perigoso"
 */

import { useMemo, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { usePrivacy } from '../contexts/PrivacyContext';

// ─── Paleta de risco ─────────────────────────────────────────────────────────
function getRiskLevel(spent, avgDaily) {
  if (spent === 0) return { key: 'clean',     color: 'bg-slate-800/60',    border: 'border-slate-700/40',    label: 'Dia Limpo' };
  const ratio = avgDaily > 0 ? spent / avgDaily : 1;
  if (ratio < 0.5)  return { key: 'low',      color: 'bg-emerald-500/80',  border: 'border-emerald-400/30',  label: 'Baixo'     };
  if (ratio < 1.0)  return { key: 'normal',   color: 'bg-green-400/80',    border: 'border-green-300/30',    label: 'Normal'    };
  if (ratio < 1.8)  return { key: 'medium',   color: 'bg-yellow-400/80',   border: 'border-yellow-300/30',   label: 'Médio'     };
  return             { key: 'danger',          color: 'bg-red-500/80',      border: 'border-red-400/30',      label: 'Perigoso'  };
}

// ─── Constantes de animação ───────────────────────────────────────────────────
const cellVariants = {
  hidden: { opacity: 0, scale: 0.4 },
  show:   (i) => ({
    opacity: 1,
    scale:   1,
    transition: {
      delay:      i * 0.012,
      type:       'spring',
      stiffness:  320,
      damping:    26,
    }
  }),
};

// ─── Tooltip ─────────────────────────────────────────────────────────────────
function Tooltip({ day, spent, label, isPrivacyMode, anchorRect, containerRef }) {
  if (!anchorRect || !containerRef.current) return null;

  const containerRect = containerRef.current.getBoundingClientRect();
  const left = anchorRect.left - containerRect.left + anchorRect.width / 2;
  const top  = anchorRect.top  - containerRect.top  - 8;

  const formattedValue = isPrivacyMode
    ? '•••••'
    : spent === 0
      ? 'Sem gastos'
      : `R$ ${spent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div
      className="absolute z-50 pointer-events-none -translate-x-1/2 -translate-y-full"
      style={{ left, top }}
    >
      <div className="bg-slate-900/95 border border-white/15 backdrop-blur-xl rounded-xl px-3 py-2 shadow-2xl shadow-black/50 whitespace-nowrap">
        <p className="text-[11px] font-bold text-white">{day}</p>
        <p className="text-[11px] text-slate-300 font-mono">{formattedValue}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <div className={`w-2 h-2 rounded-sm ${
            label === 'Dia Limpo'  ? 'bg-slate-600' :
            label === 'Baixo'      ? 'bg-emerald-500' :
            label === 'Normal'     ? 'bg-green-400' :
            label === 'Médio'      ? 'bg-yellow-400' : 'bg-red-500'
          }`} />
          <span className="text-[10px] text-slate-400">{label}</span>
        </div>
        {/* seta */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-[-5px] w-2.5 h-2.5 bg-slate-900/95 border-r border-b border-white/15 rotate-45" />
      </div>
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function SurvivalHeatmap({ transactions, currentMonth, currentYear }) {
  const { isPrivacyMode }           = usePrivacy();
  const [hovered, setHovered]       = useState(null); // { day, spent, label, rect }
  const containerRef                = useRef(null);

  // ── Construir mapa dia → gasto ──────────────────────────────────────────────
  const { days, avgDaily, totalSpent } = useMemo(() => {
    const diasNoMes   = new Date(currentYear, currentMonth, 0).getDate();
    const spendByDay  = {};

    (transactions || []).forEach(tx => {
      if (tx.type !== 'saida' && tx.type !== 'despesa') return;
      const d = new Date(tx.date || tx.createdAt);
      if (d.getMonth() + 1 !== currentMonth || d.getFullYear() !== currentYear) return;
      const key = d.getDate();
      spendByDay[key] = (spendByDay[key] || 0) + Math.abs(Number(tx.value || 0));
    });

    let totalSpent = 0;
    const daysArr  = [];
    for (let d = 1; d <= diasNoMes; d++) {
      const spent = spendByDay[d] || 0;
      totalSpent += spent;
      daysArr.push({ day: d, spent });
    }

    // Dias com algum gasto (para calcular média real)
    const daysWithSpend = daysArr.filter(d => d.spent > 0).length || 1;
    const avgDaily      = totalSpent / daysWithSpend;

    return { days: daysArr, avgDaily, totalSpent };
  }, [transactions, currentMonth, currentYear]);

  // ── Organizar em semanas (7 colunas) ─────────────────────────────────────────
  // Determinar o dia da semana do 1º dia do mês (0=Dom…6=Sab)
  const firstWeekday = new Date(currentYear, currentMonth - 1, 1).getDay();

  // Células = prefixo vazio + dias reais
  const cells = useMemo(() => {
    const blanks = Array.from({ length: firstWeekday }, () => null);
    return [...blanks, ...days];
  }, [days, firstWeekday]);

  const weekLabels = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const today      = new Date();
  const todayDay   = today.getMonth() + 1 === currentMonth && today.getFullYear() === currentYear
    ? today.getDate() : null;

  if (!transactions || transactions.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5"
    >
      {/* ── Cabeçalho ── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-quantum-bgSecondary text-quantum-accent">
            <Flame className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Mapa de Calor Financeiro</h3>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Padrão de gastos — mês actual</p>
          </div>
        </div>

        {/* Legenda */}
        <div className="hidden sm:flex items-center gap-2 text-[10px] text-slate-500">
          <span>Menos</span>
          {['bg-slate-700/80', 'bg-emerald-500/80', 'bg-green-400/80', 'bg-yellow-400/80', 'bg-red-500/80'].map((c, i) => (
            <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
          ))}
          <span>Mais</span>
        </div>
      </div>

      {/* ── Labels dos dias da semana ── */}
      <div className="grid grid-cols-7 gap-1 mb-1 px-0.5">
        {weekLabels.map((l, i) => (
          <div key={i} className="text-center text-[9px] font-bold text-slate-600 uppercase">{l}</div>
        ))}
      </div>

      {/* ── Grid de células ── */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell) {
            return <div key={`blank-${i}`} className="aspect-square" />;
          }

          const { color, border, label } = getRiskLevel(cell.spent, avgDaily);
          const isToday  = cell.day === todayDay;
          const isFuture = cell.day > (todayDay ?? 32);

          return (
            <motion.div
              key={cell.day}
              custom={i}
              variants={cellVariants}
              initial="hidden"
              animate="show"
              className={`
                aspect-square rounded-sm border cursor-default transition-transform hover:scale-125 hover:z-10 relative
                ${isFuture ? 'opacity-25' : ''}
                ${color} ${border}
                ${isToday ? 'ring-1 ring-white/60 ring-offset-1 ring-offset-slate-900' : ''}
              `}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setHovered({ day: `${cell.day}/${currentMonth < 10 ? '0' + currentMonth : currentMonth}`, spent: cell.spent, label, rect });
              }}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}
      </div>

      {/* ── Tooltip ── */}
      {hovered && (
        <Tooltip
          day={hovered.day}
          spent={hovered.spent}
          label={hovered.label}
          isPrivacyMode={isPrivacyMode}
          anchorRect={hovered.rect}
          containerRef={containerRef}
        />
      )}

      {/* ── Rodapé: resumo ── */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5 text-[10px] text-slate-500">
        <span>
          {days.filter(d => d.spent > 0).length} dias com gastos ·{' '}
          {days.filter(d => d.spent === 0 && d.day <= (todayDay ?? days.length)).length} dias limpos
        </span>
        <span className="font-mono text-slate-400">
          {isPrivacyMode
            ? '•••••'
            : `Total: R$ ${totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          }
        </span>
      </div>
    </div>
  );
}
