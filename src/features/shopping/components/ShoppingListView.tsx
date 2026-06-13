import { useState } from 'react';
import { CheckCircle2, Circle, Trash2, ChevronLeft, Link, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatBRL, toCentavos } from '../../../shared/types/money';
import type { Centavos } from '../../../shared/types/money';
import type { ShoppingList } from '../../../shared/types/shopping';
import type { CheckItemPayload } from '../hooks/useShoppingLists';

interface Props {
  list: ShoppingList;
  onBack: () => void;
  onCheckItem: (itemId: string, payload: CheckItemPayload) => Promise<void>;
  onRemoveItem: (itemId: string) => Promise<void>;
  onFinish: () => Promise<void>;
  onShowPriceHistory: (productName: string) => void;
}

const STATUS_LABEL: Record<ShoppingList['status'], string> = {
  open: 'Aberta',
  in_progress: 'Em andamento',
  done: 'Concluída',
};

const STATUS_COLOR: Record<ShoppingList['status'], string> = {
  open: 'text-blue-400',
  in_progress: 'text-yellow-400',
  done: 'text-green-400',
};

export default function ShoppingListView({ list, onBack, onCheckItem, onRemoveItem, onFinish, onShowPriceHistory }: Props) {
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [actualPrices, setActualPrices] = useState<Record<string, string>>({});

  const checkedCount = list.items.filter((it) => it.checked).length;
  const totalItems = list.items.length;

  async function handleToggleItem(itemId: string, currentlyChecked: boolean) {
    setCheckingId(itemId);
    try {
      if (!currentlyChecked) {
        const priceStr = actualPrices[itemId];
        let actualCents: Centavos | undefined;
        if (priceStr && parseFloat(priceStr.replace(',', '.')) > 0) {
          try { actualCents = toCentavos(priceStr); } catch { /* keep undefined */ }
        }
        const checkPayload: CheckItemPayload = { checked: true };
        if (actualCents !== undefined) {
          checkPayload.actualUnitPriceCents = actualCents;
          checkPayload.actualTotalCents = actualCents;
        }
        await onCheckItem(itemId, checkPayload);
        const item = list.items.find((it) => it.id === itemId);
        toast.success(`"${item?.productName}" marcado como comprado`);
      } else {
        await onCheckItem(itemId, { checked: false });
      }
    } catch {
      toast.error('Erro ao atualizar item.');
    } finally {
      setCheckingId(null);
    }
  }

  async function handleRemove(itemId: string, productName: string) {
    try {
      await onRemoveItem(itemId);
      toast.success(`"${productName}" removido da lista`);
    } catch {
      toast.error('Erro ao remover item.');
    }
  }

  async function handleFinish() {
    try {
      await onFinish();
      toast.success('Lista marcada como concluída!');
    } catch {
      toast.error('Erro ao concluir lista.');
    }
  }

  const savingsVsEstimated = (() => {
    if (list.actualTotalCents === undefined || !list.items.some((it) => it.checked)) return null;
    const estimatedChecked = list.items
      .filter((it) => it.checked)
      .reduce((acc, it) => acc + it.estimatedTotalCents, 0);
    return estimatedChecked - (list.actualTotalCents ?? 0);
  })();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-quantum-muted hover:text-quantum-fg transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-quantum-fg">{list.name}</h2>
            <div className="flex items-center gap-3 mt-0.5">
              <span className={`text-xs font-medium ${STATUS_COLOR[list.status]}`}>{STATUS_LABEL[list.status]}</span>
              {list.scheduledDate && (
                <span className="text-xs text-quantum-muted">
                  {new Date(list.scheduledDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                </span>
              )}
              {list.linkedTransactionId && (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <Link size={10} /> Vinculado
                </span>
              )}
            </div>
          </div>
        </div>
        {list.status !== 'done' && checkedCount === totalItems && totalItems > 0 && (
          <button
            onClick={handleFinish}
            className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium"
          >
            Concluir lista
          </button>
        )}
      </div>

      {/* Progresso */}
      {totalItems > 0 && (
        <div className="bg-quantum-card border border-quantum-border rounded-xl p-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-quantum-muted">{checkedCount}/{totalItems} itens comprados</span>
            <span className="text-quantum-fg font-mono font-medium">{formatBRL(list.estimatedTotalCents)} estimado</span>
          </div>
          <div className="w-full bg-quantum-bg rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: totalItems > 0 ? `${(checkedCount / totalItems) * 100}%` : '0%' }}
            />
          </div>
          {list.actualTotalCents !== undefined && list.actualTotalCents > 0 && (
            <div className="flex justify-between mt-2 text-sm">
              <span className="text-quantum-muted">Real até agora</span>
              <span className="text-quantum-fg font-mono font-medium">{formatBRL(list.actualTotalCents)}</span>
            </div>
          )}
          {savingsVsEstimated !== null && (
            <div className="flex justify-between mt-1 text-xs">
              <span className="text-quantum-muted">vs estimado (itens comprados)</span>
              <span className={savingsVsEstimated >= 0 ? 'text-green-400' : 'text-red-400'}>
                {savingsVsEstimated >= 0 ? '−' : '+'}{formatBRL(Math.abs(savingsVsEstimated) as Centavos)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Itens */}
      <div className="space-y-2">
        {list.items.length === 0 && (
          <p className="text-center text-quantum-muted text-sm py-8">Lista vazia. Adicione itens ao criar a lista.</p>
        )}
        {list.items.map((item) => (
          <div
            key={item.id}
            className={`border rounded-xl p-3 transition-all ${
              item.checked ? 'bg-green-500/5 border-green-500/20' : 'bg-quantum-card border-quantum-border'
            }`}
          >
            <div className="flex items-start gap-3">
              <button
                onClick={() => handleToggleItem(item.id, item.checked)}
                disabled={checkingId === item.id}
                className="mt-0.5 text-quantum-muted hover:text-green-400 transition-colors shrink-0"
              >
                {item.checked
                  ? <CheckCircle2 size={18} className="text-green-400" />
                  : <Circle size={18} />
                }
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-medium ${item.checked ? 'line-through text-quantum-muted' : 'text-quantum-fg'}`}>
                    {item.productName}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-mono text-quantum-fg">
                      {item.checked && item.actualTotalCents !== undefined
                        ? <span className="text-green-400">{formatBRL(item.actualTotalCents)}</span>
                        : formatBRL(item.estimatedTotalCents)
                      }
                    </span>
                    <button
                      onClick={() => onShowPriceHistory(item.productName)}
                      className="text-quantum-muted hover:text-blue-400 transition-colors"
                      title="Ver histórico de preços"
                    >
                      <TrendingUp size={13} />
                    </button>
                    <button
                      onClick={() => handleRemove(item.id, item.productName)}
                      className="text-quantum-muted hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-quantum-muted mt-0.5">
                  {item.quantity} {item.unit}
                  {item.store ? ` · ${item.store}` : ''}
                  {' · '}estimado: {formatBRL(item.estimatedUnitPriceCents)}/un
                </p>
                {/* Campo para digitar preço real antes de marcar */}
                {!item.checked && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      className="bg-quantum-bg border border-quantum-border rounded px-2 py-1 text-xs text-quantum-fg w-24 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                      placeholder="Preço real"
                      value={actualPrices[item.id] ?? ''}
                      onChange={(e) => setActualPrices((p) => ({ ...p, [item.id]: e.target.value }))}
                    />
                    <span className="text-xs text-quantum-muted">(opcional)</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
