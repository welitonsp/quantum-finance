// src/components/DashboardCards.jsx
import { Wallet, ArrowUpRight, ArrowDownRight, Atom, TrendingUp } from "lucide-react";
import { usePrivacy } from "../contexts/PrivacyContext";

const Sparkline = ({ data, color, gradientId }) => {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  
  const points = data.map((d, i) => `${(i / (data.length - 1)) * 100},${100 - ((d - min) / range) * 100}`).join(' ');
  const fillPoints = `0,100 ${points} 100,100`;

  return (
    <div className="h-10 mt-3 w-full opacity-80">
      <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={fillPoints} fill={`url(#${gradientId})`} />
        <polyline points={points} fill="none" stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

// ✅ CORREÇÃO: Componente de aviso legal para dados simulados
const SimulationBadge = () => (
  <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-amber-500/15 text-amber-400 text-[9px] font-bold rounded border border-amber-500/20 uppercase tracking-widest ml-2 align-middle" title="Dado projetado/simulado">
    Simulação
  </span>
);

export default function DashboardCards({ balances }) {
  const { isPrivacyMode } = usePrivacy();

  const saldo = Number(balances?.saldoAtual) || 0;
  const entradas = Number(balances?.entradas) || 0;
  const saidas = Number(balances?.saidas) || 0;

  const sparkDataSaldo = [30, 40, 35, 50, 49, 60, 75, 90];
  const sparkDataEntradas = [10, 20, 15, 40, 35, 50, 65, 80];
  const sparkDataSaidas = [60, 50, 55, 40, 45, 30, 25, 10]; 

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
      
      <div className="glass-card-quantum p-6 flex flex-col justify-between group">
        <div className="flex justify-between items-start mb-2">
          <span className="text-sm font-semibold text-quantum-fgMuted tracking-wide">Saldo Total</span>
          <div className="w-10 h-10 rounded-xl bg-quantum-accentDim text-quantum-accent flex items-center justify-center">
            <Wallet className="w-5 h-5" />
          </div>
        </div>
        
        <div>
          <h3 className={`text-3xl font-mono font-bold tracking-tight ${saldo >= 0 ? 'text-quantum-fg' : 'text-quantum-red'}`}>
            {!isPrivacyMode ? (
              <>
                <span className="text-lg opacity-60 mr-1 font-sans">R$</span>
                {saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </>
            ) : (
              <span className="text-quantum-fgMuted tracking-widest block mt-1">••••••••</span>
            )}
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="bg-quantum-accentDim text-quantum-accent text-xs font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> 12.4%
            </span>
            <span className="text-xs text-quantum-fgMuted">vs mês anterior <SimulationBadge /></span>
          </div>
          <Sparkline data={sparkDataSaldo} color="#00E68A" gradientId="gradSaldo" />
        </div>
      </div>

      <div className="glass-card-quantum p-6 flex flex-col justify-between group">
        <div className="flex justify-between items-start mb-2">
          <span className="text-sm font-semibold text-quantum-fgMuted tracking-wide">Entradas</span>
          <div className="w-10 h-10 rounded-xl bg-quantum-goldDim text-quantum-gold flex items-center justify-center">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>
        
        <div>
          <h3 className="text-3xl font-mono font-bold tracking-tight text-quantum-fg">
            {!isPrivacyMode ? (
              <>
                <span className="text-quantum-gold text-2xl mr-1">+</span>
                {entradas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </>
            ) : (
              <span className="text-quantum-fgMuted tracking-widest block mt-1">••••••••</span>
            )}
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="bg-quantum-goldDim text-quantum-gold text-xs font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> 8.7%
            </span>
            <span className="text-xs text-quantum-fgMuted">rendimento <SimulationBadge /></span>
          </div>
          <Sparkline data={sparkDataEntradas} color="#FFB800" gradientId="gradEntradas" />
        </div>
      </div>

      <div className="glass-card-quantum p-6 flex flex-col justify-between group">
        <div className="flex justify-between items-start mb-2">
          <span className="text-sm font-semibold text-quantum-fgMuted tracking-wide">Saídas</span>
          <div className="w-10 h-10 rounded-xl bg-quantum-redDim text-quantum-red flex items-center justify-center">
            <ArrowDownRight className="w-5 h-5" />
          </div>
        </div>
        
        <div>
          <h3 className="text-3xl font-mono font-bold tracking-tight text-quantum-fg">
            {!isPrivacyMode ? (
              <>
                <span className="text-quantum-red text-2xl mr-1">-</span>
                {saidas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </>
            ) : (
              <span className="text-quantum-fgMuted tracking-widest block mt-1">••••••••</span>
            )}
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="bg-quantum-accentDim text-quantum-accent text-xs font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> 4.2%
            </span>
            <span className="text-xs text-quantum-fgMuted">economia <SimulationBadge /></span>
          </div>
          <Sparkline data={sparkDataSaidas} color="#FF4757" gradientId="gradSaidas" />
        </div>
      </div>

      <div className="glass-card-quantum p-6 flex flex-col justify-between group">
        <div className="flex justify-between items-start mb-2">
          <span className="text-sm font-semibold text-quantum-fgMuted tracking-wide">Quantum Score</span>
          <div className="w-10 h-10 rounded-xl bg-quantum-purpleDim text-quantum-purple flex items-center justify-center animate-quantumPulse">
            <Atom className="w-5 h-5" />
          </div>
        </div>
        
        <div>
          <h3 className="text-3xl font-mono font-bold tracking-tight text-quantum-purple mt-2 flex items-center">
            94.7 <SimulationBadge />
          </h3>
          <div className="flex items-center gap-2 mt-2 mb-4">
            <span className="bg-quantum-purpleDim text-quantum-purple text-xs font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> 2.1
            </span>
            <span className="text-xs text-quantum-fgMuted">precisão da IA</span>
          </div>
          
          <div className="w-full h-1.5 bg-quantum-bg rounded-full overflow-hidden mt-6">
            <div 
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{ width: '94.7%', background: 'linear-gradient(90deg, #A855F7, #00E68A)' }}
            ></div>
          </div>
        </div>
      </div>

    </div>
  );
}