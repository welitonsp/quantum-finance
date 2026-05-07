import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckSquare, Square, Loader2, RotateCcw, Zap, ChevronDown } from 'lucide-react';
import { ALLOWED_CATEGORIES } from '../../../shared/schemas/financialSchemas';
import { getTransactionAbsCentavos } from '../../../utils/transactionUtils';
import { fromCentavos } from '../../../shared/types/money';
import type { UserCategory } from '../../../shared/schemas/categorySchemas';
import type { ParsedTransaction, CrossPageStatus, PreviewItem } from './importTypes';
import { buildImportDedupeFingerprint, catClass } from './importConstants';
import { calculatePreviewTotals } from './importHelpers';

interface PreviewPanelProps {
  transactions:                  ParsedTransaction[];
  onConfirm:                     (txs: ParsedTransaction[]) => void;
  onCancel:                      () => void;
  crossPageStatus?:              CrossPageStatus;
  crossPageMatchedFingerprints?: Set<string>;
  crossPageMatchCount?:          number;
  categories?:                   UserCategory[];
}

export { calculatePreviewTotals };

export function PreviewPanel({
  transactions, onConfirm, onCancel,
  crossPageStatus, crossPageMatchedFingerprints, crossPageMatchCount, categories,
}: PreviewPanelProps) {
  const [items,     setItems]     = useState<PreviewItem[]>(() => transactions.map(tx => ({ ...tx, _selected: true })));
  const [editingId, setEditingId] = useState<string | null>(null);

  const selected   = items.filter(t => t._selected);
  const allChecked = selected.length === items.length;

  const toggle    = (id: string) => setItems(prev => prev.map(t => t.id === id ? { ...t, _selected: !t._selected } : t));
  const toggleAll = () => setItems(prev => prev.map(t => ({ ...t, _selected: !allChecked })));
  const setCat    = (id: string, cat: string) => setItems(prev => prev.map(t => t.id === id ? { ...t, category: cat } : t));

  const { totEntry, totExit } = calculatePreviewTotals(selected);
  const crossPageCount = crossPageMatchCount ?? 0;

  const fmt = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleConfirm = () => {
    const out = selected.map(({ _selected: _s, ...tx }) => tx as ParsedTransaction);
    onConfirm(out);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-quantum-bgSecondary rounded-xl p-3 text-center border border-quantum-border">
          <p className="text-[10px] text-quantum-fgMuted uppercase mb-1">Total</p>
          <p className="text-sm font-black text-quantum-fg font-mono">{items.length}</p>
        </div>
        <div className="bg-quantum-accentDim border border-quantum-accent/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-quantum-accent uppercase mb-1">Entradas</p>
          <p className="text-xs font-black text-quantum-accent font-mono">{fmt(totEntry)}</p>
        </div>
        <div className="bg-quantum-redDim border border-quantum-red/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-quantum-red uppercase mb-1">Saídas</p>
          <p className="text-xs font-black text-quantum-red font-mono">{fmt(totExit)}</p>
        </div>
      </div>

      {crossPageStatus === 'loading' && (
        <div role="status" aria-live="polite" className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs border bg-quantum-bgSecondary border-quantum-border text-quantum-fgMuted">
          <Loader2 className="w-3 h-3 shrink-0 animate-spin" aria-hidden="true" />
          <span>Verificando duplicatas no histórico...</span>
        </div>
      )}
      {crossPageStatus === 'success' && crossPageCount > 0 && (
        <div role="status" aria-live="polite" className="px-3 py-2 rounded-xl text-xs border bg-quantum-goldDim border-quantum-gold/20 text-quantum-gold">
          {crossPageCount} duplicata{crossPageCount !== 1 ? 's' : ''} provável{crossPageCount !== 1 ? 'is' : ''} encontrada{crossPageCount !== 1 ? 's' : ''} no histórico
        </div>
      )}
      {crossPageStatus === 'success' && crossPageCount === 0 && (
        <div role="status" aria-live="polite" className="px-3 py-2 rounded-xl text-xs border bg-quantum-accentDim border-quantum-accent/20 text-quantum-accent">
          Nenhuma duplicata adicional encontrada
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <button onClick={toggleAll} aria-pressed={allChecked} className="flex items-center gap-2 text-xs text-quantum-fgMuted hover:text-quantum-fg transition-colors">
            {allChecked ? <CheckSquare className="w-4 h-4 text-quantum-accent" /> : <Square className="w-4 h-4" />}
            {allChecked ? 'Desmarcar tudo' : 'Selecionar tudo'}
          </button>
          <span className="text-xs text-quantum-fgMuted">
            <span className="text-quantum-accent font-bold">{selected.length}</span> / {items.length} selecionadas
          </span>
        </div>

        <div className="border border-quantum-border rounded-xl overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
          <table className="w-full text-xs" aria-label="Pré-visualização das transações a importar">
            <thead className="sticky top-0 bg-quantum-bg z-10">
              <tr className="border-b border-quantum-border">
                <th scope="col" aria-label="Selecionar" className="w-8 px-3 py-2" />
                <th scope="col" className="px-3 py-2 text-left text-quantum-fgMuted font-bold uppercase tracking-wider">Data</th>
                <th scope="col" className="px-3 py-2 text-left text-quantum-fgMuted font-bold uppercase tracking-wider">Descrição</th>
                <th scope="col" className="px-3 py-2 text-left text-quantum-fgMuted font-bold uppercase tracking-wider">Categoria</th>
                <th scope="col" className="px-3 py-2 text-right text-quantum-fgMuted font-bold uppercase tracking-wider">Valor</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {items.map((tx, i) => (
                  <motion.tr
                    key={tx.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.02, 0.3) }}
                    className={`border-b border-quantum-border/50 last:border-0 transition-colors ${
                      tx._selected ? 'bg-transparent' : 'bg-quantum-bg/40 opacity-40'
                    }`}
                  >
                    <td className="px-3 py-2">
                      <button onClick={() => toggle(tx.id)} aria-label={`${tx._selected ? 'Desmarcar' : 'Selecionar'} transação ${tx.description || 'sem descrição'}`} className="flex items-center justify-center w-full">
                        {tx._selected
                          ? <CheckSquare className="w-3.5 h-3.5 text-quantum-accent" />
                          : <Square      className="w-3.5 h-3.5 text-quantum-fgMuted" />
                        }
                      </button>
                    </td>
                    <td className="px-3 py-2 font-mono text-quantum-fgMuted whitespace-nowrap">{tx.date}</td>
                    <td className="px-3 py-2 text-quantum-fg max-w-[140px]" title={tx.description}>
                      <span className="truncate block">{tx.description}</span>
                      {crossPageMatchedFingerprints?.has(buildImportDedupeFingerprint(tx)) && (
                        <span
                          aria-label="Duplicata provável no histórico"
                          className="inline-flex mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-quantum-goldDim border border-quantum-gold/30 text-quantum-gold leading-none"
                        >
                          Duplicata provável no histórico
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editingId === tx.id ? (
                        <select
                          autoFocus
                          value={tx.category ?? ''}
                          onChange={e => { setCat(tx.id, e.target.value); setEditingId(null); }}
                          onBlur={() => setEditingId(null)}
                          aria-label={`Selecionar categoria da transação ${tx.description || 'sem descrição'}`}
                          className="bg-quantum-bgSecondary border border-quantum-accent/30 rounded-lg px-1 py-0.5 text-[10px] text-quantum-fg outline-none"
                        >
                          {(() => {
                            const defaults = (categories ?? []).filter(c => c.isDefault);
                            const custom   = (categories ?? []).filter(c => !c.isDefault);
                            const base     = defaults.length > 0 ? defaults : [...ALLOWED_CATEGORIES].map(n => ({ id: n, name: n } as UserCategory));
                            return custom.length > 0 ? (
                              <>
                                <optgroup label="Padrão">
                                  {base.map(c => <option key={c.id ?? c.name} value={c.name}>{c.name}</option>)}
                                </optgroup>
                                <optgroup label="Personalizadas">
                                  {custom.map(c => <option key={c.id ?? c.name} value={c.name}>{c.name}</option>)}
                                </optgroup>
                              </>
                            ) : (
                              base.map(c => <option key={c.id ?? c.name} value={c.name}>{c.name}</option>)
                            );
                          })()}
                        </select>
                      ) : (
                        <button
                          onClick={() => setEditingId(tx.id)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold transition-all hover:opacity-80 ${catClass(tx.category)}`}
                          title="Clique para editar"
                          aria-label={`Editar categoria da transação ${tx.description || 'sem descrição'}`}
                        >
                          {tx.category ?? 'Diversos'}
                          <ChevronDown className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono font-bold whitespace-nowrap ${
                      (tx.type === 'entrada' || tx.type === 'receita') ? 'text-quantum-accent' : 'text-quantum-red'
                    }`}>
                      {(tx.type === 'entrada' || tx.type === 'receita') ? '+' : '-'}{fmt(fromCentavos(getTransactionAbsCentavos(tx)))}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onCancel} className="btn-quantum-secondary flex items-center gap-2">
          <RotateCcw className="w-3.5 h-3.5" /> Recomeçar
        </button>
        <button
          onClick={handleConfirm}
          disabled={selected.length === 0}
          className="btn-quantum-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Zap className="w-4 h-4" />
          Importar {selected.length} transaç{selected.length === 1 ? 'ão' : 'ões'}
        </button>
      </div>
    </motion.div>
  );
}
