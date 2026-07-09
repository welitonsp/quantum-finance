// Radar de Compras — card-âncora (FASE Radar de Compras, primeiro movimento da
// Tese Extraordinária 2026-07-09). Puramente presentacional: consome o motor
// puro shoppingRadar.ts sobre as priceObservations já carregadas. Zero I/O,
// zero cálculo float. É a narrativa "economizo no mercado com prova fiscal".

import { useMemo } from 'react';
import { Radar, TrendingUp, PiggyBank, ArrowRight } from 'lucide-react';
import { formatBRL } from '../../../shared/types/money';
import type { PriceObservation } from '../../../shared/types/shopping';
import { buildShoppingRadar } from '../lib/shoppingRadar';

interface Props {
  observations: PriceObservation[];
  onShowPriceHistory: (productName: string) => void;
}

/** bps inteiro → "+N,NN%" por formatação inteira (sem float). */
function formatRiseBps(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const frac = String(bps % 100).padStart(2, '0');
  return `+${whole},${frac}%`;
}

export default function ShoppingRadarCard({ observations, onShowPriceHistory }: Props) {
  const radar = useMemo(() => buildShoppingRadar(observations), [observations]);

  // Gating: sem sinal acionável, o card não aparece (UI que some).
  if (radar.opportunities.length === 0 && radar.alerts.length === 0) return null;

  const hasSavings = radar.totalPotentialSavingsCents > 0;

  return (
    <section
      aria-label="Radar de Compras"
      className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/25 to-quantum-card p-5 space-y-4"
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
          <Radar size={17} className="text-emerald-400" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-black text-quantum-fg">Radar de Compras</h2>
          <p className="text-[11px] text-quantum-muted">Derivado das suas notas fiscais reais</p>
        </div>
      </div>

      {hasSavings && (
        <div className="flex items-baseline gap-2">
          <PiggyBank size={18} className="text-emerald-400 shrink-0 self-center" />
          <span className="text-2xl font-black text-emerald-400 font-mono">
            {formatBRL(radar.totalPotentialSavingsCents)}
          </span>
          <span className="text-xs text-quantum-muted">
            de economia potencial trocando de loja
          </span>
        </div>
      )}

      {/* Oportunidades de economia */}
      {radar.opportunities.length > 0 && (
        <ul className="space-y-1.5">
          {radar.opportunities.map((o) => (
            <li key={o.productKey}>
              <button
                onClick={() => onShowPriceHistory(o.displayName)}
                className="w-full flex items-center justify-between rounded-lg px-3 py-2 hover:bg-quantum-bg transition-colors text-left"
              >
                <span className="text-sm text-quantum-fg truncate flex-1 min-w-0">
                  {o.displayName}
                </span>
                <span className="flex items-center gap-1.5 text-xs shrink-0 ml-2">
                  <span className="text-quantum-muted truncate max-w-[7rem]">{o.cheapestStore}</span>
                  <ArrowRight size={12} className="text-emerald-400 shrink-0" />
                  <span className="font-mono font-bold text-emerald-400">
                    −{formatBRL(o.savingsCents)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Alertas de alta */}
      {radar.alerts.length > 0 && (
        <div className="pt-1 border-t border-quantum-border/60 space-y-1.5">
          <p className="text-[10px] uppercase font-bold text-quantum-muted tracking-wider pt-2">
            Subiram de preço
          </p>
          {radar.alerts.map((a) => (
            <button
              key={a.productKey}
              onClick={() => onShowPriceHistory(a.displayName)}
              className="w-full flex items-center justify-between rounded-lg px-3 py-1.5 hover:bg-quantum-bg transition-colors text-left"
            >
              <span className="text-sm text-quantum-fg truncate flex-1 min-w-0">{a.displayName}</span>
              <span className="flex items-center gap-1.5 text-xs font-mono shrink-0 text-rose-400 ml-2">
                <TrendingUp size={13} />
                {formatRiseBps(a.bps)}
                <span className="text-quantum-muted">em {a.store}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
