import { X, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatBRL } from '../../../shared/types/money';
import type { PriceObservation } from '../../../shared/types/shopping';
import type { Centavos } from '../../../shared/types/money';

interface Props {
  productName: string;
  observations: PriceObservation[];
  onClose: () => void;
}

export default function PriceHistoryPanel({ productName, observations, onClose }: Props) {
  const sorted = [...observations].sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  const latest = sorted[0]?.unitPriceCents;
  const previous = sorted[1]?.unitPriceCents;

  const diff = latest !== undefined && previous !== undefined ? latest - previous : null;
  const pct = diff !== null && previous ? ((diff / previous) * 100).toFixed(1) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-quantum-card border border-quantum-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-quantum-border">
          <div>
            <h3 className="font-semibold text-quantum-fg">Histórico de preços</h3>
            <p className="text-sm text-quantum-muted mt-0.5 truncate max-w-[240px]">{productName}</p>
          </div>
          <button onClick={onClose} className="text-quantum-muted hover:text-quantum-fg transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">
          {observations.length === 0 ? (
            <p className="text-sm text-quantum-muted text-center py-6">
              Nenhum histórico de preço para este produto ainda.
            </p>
          ) : (
            <>
              {/* Resumo */}
              {diff !== null && pct !== null && (
                <div className={`flex items-center gap-2 mb-4 text-sm px-3 py-2 rounded-lg ${
                  diff > 0 ? 'bg-red-500/10 text-red-400' : diff < 0 ? 'bg-green-500/10 text-green-400' : 'bg-quantum-bg/50 text-quantum-muted'
                }`}>
                  {diff > 0 ? <TrendingUp size={16} /> : diff < 0 ? <TrendingDown size={16} /> : <Minus size={16} />}
                  <span>
                    {diff > 0 ? 'Subiu' : diff < 0 ? 'Baixou' : 'Estável'}{' '}
                    {Math.abs(parseFloat(pct))}% na última observação
                    {diff !== 0 && ` (${formatBRL(Math.abs(diff) as Centavos)})`}
                  </span>
                </div>
              )}

              {/* Lista de observações */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {sorted.map((obs) => (
                  <div key={obs.id} className="flex items-center justify-between py-2 border-b border-quantum-border/50 last:border-0">
                    <div>
                      <p className="text-sm text-quantum-fg font-mono font-medium">{formatBRL(obs.unitPriceCents)}/un</p>
                      <p className="text-xs text-quantum-muted">
                        {new Date(obs.observedAt + 'T12:00:00').toLocaleDateString('pt-BR')}
                        {obs.store ? ` · ${obs.store}` : ''}
                        {` · ${obs.quantity} ${obs.unit}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
