import { useState } from 'react';
import { X, Plus, Trash2, ShoppingCart } from 'lucide-react';
import Decimal from 'decimal.js';
import { formatBRL, toCentavos } from '../../../shared/types/money';
import type { Centavos } from '../../../shared/types/money';
import type { ShoppingUnit } from '../../../shared/types/shopping';
import type { AddItemPayload } from '../hooks/useShoppingLists';

const UNITS: { value: ShoppingUnit; label: string }[] = [
  { value: 'un',  label: 'Unidade' },
  { value: 'kg',  label: 'Kg'      },
  { value: 'g',   label: 'g'       },
  { value: 'L',   label: 'Litro'   },
  { value: 'mL',  label: 'mL'      },
  { value: 'cx',  label: 'Caixa'   },
  { value: 'pct', label: 'Pacote'  },
  { value: 'dz',  label: 'Dúzia'   },
];

interface DraftItem {
  productName: string;
  quantity: string;
  unit: ShoppingUnit;
  estimatedUnitPrice: string;
  notes: string;
  store: string;
}

function emptyDraft(): DraftItem {
  return { productName: '', quantity: '1', unit: 'un', estimatedUnitPrice: '', notes: '', store: '' };
}

function calcTotal(qty: string, unitPrice: string): Centavos | null {
  try {
    const q = new Decimal(qty.replace(',', '.'));
    const p = toCentavos(unitPrice || '0');
    if (q.lte(0) || p <= 0) return null;
    const total = q.times(p).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    return total as Centavos;
  } catch {
    return null;
  }
}

interface Props {
  onSave: (name: string, scheduledDate: string | undefined, items: AddItemPayload[]) => Promise<void>;
  onClose: () => void;
}

export default function ShoppingListForm({ onSave, onClose }: Props) {
  const [listName, setListName] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [items, setItems] = useState<(DraftItem & { id: string })[]>([]);
  const [draft, setDraft] = useState<DraftItem>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function addDraftItem() {
    if (!draft.productName.trim()) { setError('Informe o nome do produto.'); return; }
    if (!draft.estimatedUnitPrice || parseFloat(draft.estimatedUnitPrice.replace(',', '.')) <= 0) {
      setError('Informe o preço estimado.'); return;
    }
    setError('');
    setItems((prev) => [...prev, { ...draft, id: crypto.randomUUID() }]);
    setDraft(emptyDraft());
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  async function handleSave() {
    if (!listName.trim()) { setError('Informe o nome da lista.'); return; }
    setSaving(true);
    try {
      const payloads: AddItemPayload[] = items.map((it) => {
        const unitPriceCents = toCentavos(it.estimatedUnitPrice);
        const total = calcTotal(it.quantity, it.estimatedUnitPrice) ?? unitPriceCents;
        const payload: AddItemPayload = {
          productName: it.productName.trim(),
          quantity: it.quantity,
          unit: it.unit,
          estimatedUnitPriceCents: unitPriceCents,
          estimatedTotalCents: total,
          checked: false,
        };
        const store = it.store.trim();
        if (store) payload.store = store;
        const notes = it.notes.trim();
        if (notes) payload.notes = notes;
        return payload;
      });
      await onSave(listName.trim(), scheduledDate || undefined, payloads);
      onClose();
    } catch {
      setError('Erro ao salvar lista. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  const estimatedListTotal = items.reduce((acc, it) => {
    const t = calcTotal(it.quantity, it.estimatedUnitPrice);
    return t ? acc + t : acc;
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-quantum-card border border-quantum-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-quantum-border">
          <div className="flex items-center gap-3">
            <ShoppingCart className="text-blue-400" size={22} />
            <h2 className="text-lg font-semibold text-quantum-fg">Nova Lista de Compras</h2>
          </div>
          <button onClick={onClose} className="text-quantum-muted hover:text-quantum-fg transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Lista metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-quantum-muted mb-1">Nome da lista *</label>
              <input
                className="w-full bg-quantum-bg border border-quantum-border rounded-lg px-3 py-2 text-quantum-fg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                placeholder="Ex: Mercado semanal"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-quantum-muted mb-1">Data planejada</label>
              <input
                type="date"
                className="w-full bg-quantum-bg border border-quantum-border rounded-lg px-3 py-2 text-quantum-fg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>
          </div>

          {/* Adicionar item */}
          <div className="bg-quantum-bg/50 border border-quantum-border rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-quantum-muted">Adicionar item</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <input
                  className="w-full bg-quantum-bg border border-quantum-border rounded-lg px-3 py-2 text-quantum-fg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="Nome do produto *"
                  value={draft.productName}
                  onChange={(e) => setDraft((d) => ({ ...d, productName: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addDraftItem()}
                />
              </div>
              <div>
                <input
                  className="w-full bg-quantum-bg border border-quantum-border rounded-lg px-3 py-2 text-quantum-fg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="Loja"
                  value={draft.store}
                  onChange={(e) => setDraft((d) => ({ ...d, store: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              <input
                className="bg-quantum-bg border border-quantum-border rounded-lg px-3 py-2 text-quantum-fg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                placeholder="Qtd"
                value={draft.quantity}
                onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
              />
              <select
                className="bg-quantum-bg border border-quantum-border rounded-lg px-2 py-2 text-quantum-fg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                value={draft.unit}
                onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value as ShoppingUnit }))}
              >
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
              <input
                className="bg-quantum-bg border border-quantum-border rounded-lg px-3 py-2 text-quantum-fg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                placeholder="R$ unit."
                value={draft.estimatedUnitPrice}
                onChange={(e) => setDraft((d) => ({ ...d, estimatedUnitPrice: e.target.value }))}
              />
              <div className="text-sm text-quantum-muted flex items-center">
                {calcTotal(draft.quantity, draft.estimatedUnitPrice) !== null
                  ? <span className="text-green-400 font-mono">{formatBRL(calcTotal(draft.quantity, draft.estimatedUnitPrice)!)}</span>
                  : <span>—</span>
                }
              </div>
            </div>
            <button
              onClick={addDraftItem}
              className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              <Plus size={16} /> Adicionar à lista
            </button>
          </div>

          {/* Itens adicionados */}
          {items.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-quantum-muted">Itens ({items.length})</p>
              {items.map((it) => (
                <div key={it.id} className="flex items-center justify-between bg-quantum-bg/30 border border-quantum-border rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-quantum-fg font-medium truncate block">{it.productName}</span>
                    <span className="text-xs text-quantum-muted">
                      {it.quantity} {it.unit} × {it.estimatedUnitPrice}
                      {it.store ? ` · ${it.store}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 ml-3 shrink-0">
                    <span className="text-sm text-quantum-fg font-mono">
                      {calcTotal(it.quantity, it.estimatedUnitPrice) !== null
                        ? formatBRL(calcTotal(it.quantity, it.estimatedUnitPrice)!)
                        : '—'}
                    </span>
                    <button onClick={() => removeItem(it.id)} className="text-quantum-muted hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between pt-1 text-sm">
                <span className="text-quantum-muted">Total estimado</span>
                <span className="text-quantum-fg font-semibold font-mono">{formatBRL(estimatedListTotal as Centavos)}</span>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-quantum-border flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-quantum-muted hover:text-quantum-fg border border-quantum-border rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !listName.trim()}
            className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
          >
            {saving ? 'Salvando…' : 'Criar lista'}
          </button>
        </div>
      </div>
    </div>
  );
}
