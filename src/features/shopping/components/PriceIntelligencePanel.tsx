// Painel de inteligência de preços — FASE Cesta Pessoal, entregável 2.
// Puramente presentacional: consome o motor puro priceIntelligence.ts sobre
// as priceObservations já carregadas. Zero I/O próprio, zero cálculo float.

import { useMemo } from 'react';
import { TrendingDown, TrendingUp, Trophy, Store } from 'lucide-react';
import Decimal from 'decimal.js';
import { formatBRL } from '../../../shared/types/money';
import type { PriceObservation, ShoppingList } from '../../../shared/types/shopping';
import {
  buildPriceCatalog,
  compareBasketAcrossStores,
  type BasketItemInput,
} from '../lib/priceIntelligence';

interface Props {
  observations: PriceObservation[];
  /** Lista ativa para a comparação de cesta (primeira aberta, se houver). */
  activeList: ShoppingList | null;
  onShowPriceHistory: (productName: string) => void;
}

/** bps inteiro → "±N,NN%" por formatação inteira (sem float). */
function formatBps(bps: number): string {
  const sign = bps > 0 ? '+' : bps < 0 ? '−' : '';
  const abs = Math.abs(bps);
  const whole = Math.trunc(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${whole},${frac}%`;
}

/** "1.5" (string decimal validada) → 150; inválida → 100 (1×). */
function quantityTimes100(quantity: string): number {
  try {
    const q = new Decimal(quantity.trim().replace(',', '.')).times(100);
    if (q.isInteger() && q.greaterThan(0) && q.lessThanOrEqualTo(1_000_000)) {
      return q.toNumber();
    }
    const truncated = q.trunc();
    if (truncated.greaterThan(0)) return truncated.toNumber();
  } catch { /* fallback abaixo */ }
  return 100;
}

export default function PriceIntelligencePanel({ observations, activeList, onShowPriceHistory }: Props) {
  const catalog = useMemo(() => buildPriceCatalog(observations), [observations]);

  const basketComparison = useMemo(() => {
    if (!activeList || activeList.items.length === 0) return null;
    const basket: BasketItemInput[] = activeList.items.map((item) => ({
      productName: item.productName,
      quantityTimes100: quantityTimes100(item.quantity),
    }));
    const result = compareBasketAcrossStores(basket, observations);
    return result.quotes.length > 0 ? result : null;
  }, [activeList, observations]);

  const movers = useMemo(
    () => catalog
      .filter((p) => p.trendBps !== null && p.trendBps !== 0)
      .sort((a, b) => Math.abs(b.trendBps!) - Math.abs(a.trendBps!))
      .slice(0, 5),
    [catalog],
  );

  if (catalog.length === 0) return null;

  return (
    <section aria-label="Inteligência de preços" className="space-y-4">
      {/* Comparação da cesta da lista ativa */}
      {basketComparison && activeList && (
        <div className="bg-quantum-card border border-quantum-border rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-bold text-quantum-fg flex items-center gap-2">
            <Store size={16} className="text-blue-400" />
            Onde comprar &ldquo;{activeList.name}&rdquo;
          </h2>
          <div className="space-y-2">
            {basketComparison.quotes.slice(0, 4).map((quote) => {
              const isBest = basketComparison.bestFullCoverage?.store === quote.store;
              const fullCoverage = quote.coveredItems === quote.totalItems;
              return (
                <div
                  key={quote.store}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 border ${
                    isBest ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-quantum-border/60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isBest && <Trophy size={14} className="text-emerald-400 shrink-0" />}
                    <span className="text-sm text-quantum-fg truncate">{quote.store}</span>
                    <span className="text-xs text-quantum-muted shrink-0">
                      {quote.coveredItems}/{quote.totalItems} itens
                    </span>
                  </div>
                  <span className={`font-mono text-sm ${fullCoverage ? 'text-quantum-fg' : 'text-quantum-muted'}`}>
                    {formatBRL(quote.totalCents)}{!fullCoverage && ' *'}
                  </span>
                </div>
              );
            })}
          </div>
          {basketComparison.savingsCents > 0 && basketComparison.bestFullCoverage && (
            <p className="text-xs text-emerald-400">
              Economia de {formatBRL(basketComparison.savingsCents)} comprando tudo em{' '}
              {basketComparison.bestFullCoverage.store}.
            </p>
          )}
          {basketComparison.quotes.some((q) => q.coveredItems < q.totalItems) && (
            <p className="text-xs text-quantum-muted">* total parcial — loja sem preço conhecido para todos os itens.</p>
          )}
        </div>
      )}

      {/* Movimentos de preço */}
      {movers.length > 0 && (
        <div className="bg-quantum-card border border-quantum-border rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-bold text-quantum-fg">Movimentos de preço</h2>
          <div className="space-y-1.5">
            {movers.map((product) => {
              const rising = product.trendBps! > 0;
              return (
                <button
                  key={product.productKey}
                  onClick={() => onShowPriceHistory(product.displayName)}
                  className="w-full flex items-center justify-between rounded-lg px-3 py-2 hover:bg-quantum-bg transition-colors text-left"
                >
                  <span className="text-sm text-quantum-fg truncate flex-1">{product.displayName}</span>
                  <span className={`flex items-center gap-1.5 text-xs font-mono shrink-0 ${rising ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {rising ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                    {formatBps(product.trendBps!)}
                    <span className="text-quantum-muted">
                      ({formatBRL(product.bestStore.lastUnitPriceCents)} em {product.bestStore.store})
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
