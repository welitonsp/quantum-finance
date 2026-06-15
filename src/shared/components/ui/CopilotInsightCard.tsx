import { useState } from 'react';
import { Lightbulb, Target, Zap, ChevronDown, ChevronUp, Database, Check, X } from 'lucide-react';

export type InsightType       = 'insight' | 'recomendacao' | 'acao';
export type ConfidenceLevel   = 'alta' | 'media' | 'baixa';

export interface CopilotInsightData {
  type:        InsightType;
  confidence:  ConfidenceLevel;
  dataSources: string[];
  title:       string;
  description: string;
  action?: {
    label:   string;
    onConfirm: () => void;
  };
}

interface Props extends CopilotInsightData {
  className?: string;
}

const TYPE_CFG = {
  insight:     { icon: Lightbulb, label: 'Insight',       color: 'text-cyan-400',    bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20'   },
  recomendacao:{ icon: Target,    label: 'Recomendação',   color: 'text-amber-400',   bg: 'bg-amber-500/10',  border: 'border-amber-500/20'  },
  acao:        { icon: Zap,       label: 'Ação',           color: 'text-quantum-accent', bg: 'bg-quantum-accent/10', border: 'border-quantum-accent/20' },
} as const;

const CONFIDENCE_CFG = {
  alta:  { label: 'Confiança Alta',  chip: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  media: { label: 'Confiança Média', chip: 'bg-amber-500/15 text-amber-400 border-amber-500/25'       },
  baixa: { label: 'Confiança Baixa', chip: 'bg-red-500/15 text-red-400 border-red-500/25'             },
} as const;

export function CopilotInsightCard({ type, confidence, dataSources, title, description, action, className = '' }: Props) {
  const [showSources, setShowSources] = useState(false);
  const [confirming,  setConfirming]  = useState(false);

  const typeCfg       = TYPE_CFG[type];
  const confidenceCfg = CONFIDENCE_CFG[confidence];
  const Icon          = typeCfg.icon;

  const handleConfirm = () => {
    action?.onConfirm();
    setConfirming(false);
  };

  return (
    <div className={`rounded-2xl border bg-quantum-card/40 backdrop-blur-sm overflow-hidden ${typeCfg.border} ${className}`}>
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        <div className={`p-2 rounded-xl ${typeCfg.bg} shrink-0`}>
          <Icon className={`w-4 h-4 ${typeCfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-black uppercase tracking-wider ${typeCfg.color}`}>{typeCfg.label}</span>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${confidenceCfg.chip}`}>
              {confidenceCfg.label}
            </span>
          </div>
          <p className="text-sm font-bold text-quantum-fg">{title}</p>
          <p className="text-xs text-quantum-fgMuted mt-1 leading-relaxed">{description}</p>
        </div>
      </div>

      {/* Data sources */}
      {dataSources.length > 0 && (
        <div className="px-4 pb-3 border-t border-quantum-border/30 pt-2">
          <button
            onClick={() => setShowSources(s => !s)}
            className="flex items-center gap-1.5 text-[10px] text-quantum-fgMuted hover:text-quantum-fg transition-colors"
          >
            <Database className="w-3 h-3" />
            <span>Dados utilizados ({dataSources.length})</span>
            {showSources ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showSources && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {dataSources.map(src => (
                <span key={src} className="text-[10px] px-2 py-0.5 rounded-full border border-quantum-border bg-quantum-card/60 text-quantum-fgMuted">
                  {src}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action zone */}
      {action && (
        <div className={`px-4 py-3 border-t border-quantum-border/30 ${typeCfg.bg}`}>
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className={`text-xs font-bold px-4 py-1.5 rounded-xl border ${typeCfg.border} ${typeCfg.color} hover:brightness-110 transition-all`}
            >
              {action.label}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-xs text-quantum-fgMuted">Confirmar ação?</span>
              <button
                onClick={handleConfirm}
                className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:brightness-110 transition-all"
              >
                <Check className="w-3 h-3" /> Confirmar
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/25 hover:brightness-110 transition-all"
              >
                <X className="w-3 h-3" /> Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
