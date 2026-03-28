import { Target, AlertTriangle, CheckCircle2, BrainCircuit } from "lucide-react";

export default function BudgetProgress({ totalExpenses, monthlyGoal, onSetGoal }) {
  // Se não houver meta, mostramos o convite para criar uma
  if (!monthlyGoal || monthlyGoal <= 0) {
    return (
      <div className="glass-card-dark p-6 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 border-dashed border-2 border-indigo-500/30">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-white font-bold tracking-wide uppercase text-sm">Meta de Gastos Indefinida</h3>
            <p className="text-slate-400 text-xs">Defina um limite mensal para ativar o Conselheiro de Risco IA.</p>
          </div>
        </div>
        <button onClick={onSetGoal} className="glass-btn-secondary text-xs px-6">
          Definir Teto Mensal
        </button>
      </div>
    );
  }

  // A Matemática do Radar
  const percentage = Math.min((totalExpenses / monthlyGoal) * 100, 100);
  const remaining = Math.max(monthlyGoal - totalExpenses, 0);
  
  // A Inteligência do Risk Advisor
  let statusColor = "bg-emerald-500";
  let textColor = "text-emerald-400";
  let StatusIcon = CheckCircle2;
  let advisorMessage = "Ritmo excelente! Mantenha esta cadência para garantir a sua margem no fim do mês.";

  if (percentage >= 90) {
    statusColor = "bg-red-500";
    textColor = "text-red-400";
    StatusIcon = AlertTriangle;
    advisorMessage = "Alerta Crítico: Está muito próximo do limite. Cancele despesas não essenciais imediatamente.";
  } else if (percentage >= 70) {
    statusColor = "bg-amber-500";
    textColor = "text-amber-400";
    StatusIcon = AlertTriangle;
    advisorMessage = "Atenção: Já consumiu grande parte da meta. Otimize os seus gastos nos próximos dias.";
  }

  return (
    <div className="glass-card-dark p-6 mb-8 relative overflow-hidden group">
      {/* Aura de Risco (Brilho condicional no fundo) */}
      <div className={`absolute -right-20 -top-20 w-40 h-40 ${statusColor} opacity-5 blur-[80px] rounded-full transition-colors duration-1000`}></div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
        
        {/* Lado Esquerdo: A Barra Física (2/3 da tela) */}
        <div className="lg:col-span-2 flex flex-col justify-center">
          <div className="flex justify-between items-end mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <StatusIcon className={`w-4 h-4 ${textColor}`} />
                <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300">Radar de Consumo</h2>
              </div>
              <button onClick={onSetGoal} className="text-[10px] text-slate-500 hover:text-indigo-400 uppercase tracking-wider underline transition-colors">
                Alterar Meta (R$ {monthlyGoal})
              </button>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Margem Livre</p>
              <p className={`text-2xl font-black font-mono ${textColor} transition-colors duration-500`}>
                R$ {remaining.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <div className="relative">
            <div className="flex justify-between text-[10px] text-slate-400 font-mono mb-2 uppercase tracking-wider">
              <span>Usado: R$ {totalExpenses.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              <span>{percentage.toFixed(1)}%</span>
            </div>
            {/* A calha da barra */}
            <div className="h-3 w-full bg-slate-900/80 rounded-full overflow-hidden border border-white/5">
              {/* O preenchimento com a física que extraímos do CSS */}
              <div 
                className={`h-full ${statusColor} relative`}
                style={{ width: `${percentage}%`, transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.5s ease' }}
              >
                <div className="absolute top-0 right-0 bottom-0 w-10 bg-gradient-to-r from-transparent to-white/30"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Lado Direito: Conselheiro de Risco (1/3 da tela) */}
        <div className="bg-slate-900/40 rounded-xl p-4 border border-white/5 flex flex-col justify-center transition-all hover:bg-slate-900/60">
          <div className="flex items-center gap-2 mb-2">
            <BrainCircuit className={`w-4 h-4 ${textColor} animate-pulse`} />
            <span className={`text-xs font-bold uppercase tracking-widest ${textColor}`}>Risk Advisor</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed italic">
            "{advisorMessage}"
          </p>
        </div>

      </div>
    </div>
  );
}