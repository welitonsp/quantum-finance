import { useState, useCallback } from 'react';
import { ShoppingCart, Plus, Trash2, Calendar, CheckCircle2, Circle, Clock, ClipboardPaste } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatBRL } from '../../shared/types/money';
import type { Centavos } from '../../shared/types/money';
import type { ShoppingList } from '../../shared/types/shopping';
import { useShoppingLists } from './hooks/useShoppingLists';
import { usePriceObservations } from './hooks/usePriceObservations';
import ShoppingListForm from './components/ShoppingListForm';
import ShoppingListView from './components/ShoppingListView';
import PriceHistoryPanel from './components/PriceHistoryPanel';
import NfceImportPanel from './components/NfceImportPanel';
import PriceIntelligencePanel from './components/PriceIntelligencePanel';
import type { AddItemPayload } from './hooks/useShoppingLists';

interface Props {
  uid: string;
}

const STATUS_LABEL: Record<ShoppingList['status'], string> = {
  open: 'Aberta',
  in_progress: 'Em andamento',
  done: 'Concluída',
};

const STATUS_ICON: Record<ShoppingList['status'], React.ReactNode> = {
  open: <Circle size={14} className="text-blue-400" />,
  in_progress: <Clock size={14} className="text-yellow-400" />,
  done: <CheckCircle2 size={14} className="text-green-400" />,
};

export default function ShoppingPage({ uid }: Props) {
  const { lists, loading, createList, deleteList, addItem, checkItem, removeItem, finishList } = useShoppingLists(uid);
  const { observations, forProduct, addObservation } = usePriceObservations(uid);
  const [showForm, setShowForm] = useState(false);
  const [showNfceImport, setShowNfceImport] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [priceHistoryProduct, setPriceHistoryProduct] = useState<string | null>(null);

  const selectedList = lists.find((l) => l.id === selectedListId) ?? null;

  const handleCreateList = useCallback(async (name: string, scheduledDate: string | undefined, items: AddItemPayload[]) => {
    const listId = await createList(name, scheduledDate);
    for (const item of items) {
      await addItem(listId, item);
      // Record price observations for items with store info
      if (item.store && item.estimatedUnitPriceCents > 0) {
        try {
          await addObservation({
            productName: item.productName,
            store: item.store,
            unitPriceCents: item.estimatedUnitPriceCents,
            quantity: item.quantity,
            unit: item.unit,
            observedAt: scheduledDate ?? new Date().toISOString().slice(0, 10),
            sourceListId: listId,
          });
        } catch { /* silently ignore observation errors */ }
      }
    }
    toast.success(`Lista "${name}" criada com ${items.length} item${items.length !== 1 ? 's' : ''}`);
  }, [createList, addItem, addObservation]);

  const handleDeleteList = useCallback(async (listId: string, listName: string) => {
    if (!confirm(`Excluir lista "${listName}"?`)) return;
    try {
      await deleteList(listId);
      if (selectedListId === listId) setSelectedListId(null);
      toast.success('Lista excluída.');
    } catch {
      toast.error('Erro ao excluir lista.');
    }
  }, [deleteList, selectedListId]);

  const handleShowPriceHistory = useCallback((productName: string) => {
    setPriceHistoryProduct(productName);
  }, []);

  // Stats
  const openCount = lists.filter((l) => l.status !== 'done').length;
  const totalEstimated = lists
    .filter((l) => l.status !== 'done')
    .reduce((acc, l) => acc + l.estimatedTotalCents, 0) as Centavos;

  if (selectedList) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <ShoppingListView
          list={selectedList}
          onBack={() => setSelectedListId(null)}
          onCheckItem={(itemId, payload) => checkItem(selectedList.id, itemId, payload)}
          onRemoveItem={(itemId) => removeItem(selectedList.id, itemId)}
          onFinish={() => finishList(selectedList.id)}
          onShowPriceHistory={handleShowPriceHistory}
        />
        {priceHistoryProduct && (
          <PriceHistoryPanel
            productName={priceHistoryProduct}
            observations={forProduct(priceHistoryProduct)}
            onClose={() => setPriceHistoryProduct(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-quantum-fg flex items-center gap-2">
            <ShoppingCart className="text-blue-400" size={26} />
            Compras Inteligentes
          </h1>
          <p className="text-quantum-muted text-sm mt-1">
            Planeje suas compras e acompanhe gastos reais vs estimados
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNfceImport(true)}
            className="flex items-center gap-2 px-4 py-2 border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 text-sm rounded-xl transition-colors font-medium"
          >
            <ClipboardPaste size={16} /> Importar NFC-e
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-xl transition-colors font-medium"
          >
            <Plus size={16} /> Nova lista
          </button>
        </div>
      </div>

      {/* Stats */}
      {lists.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-quantum-card border border-quantum-border rounded-xl p-4">
            <p className="text-xs text-quantum-muted">Listas ativas</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{openCount}</p>
          </div>
          <div className="bg-quantum-card border border-quantum-border rounded-xl p-4">
            <p className="text-xs text-quantum-muted">Estimado (ativas)</p>
            <p className="text-2xl font-bold text-quantum-fg mt-1 font-mono">{formatBRL(totalEstimated)}</p>
          </div>
          <div className="bg-quantum-card border border-quantum-border rounded-xl p-4 hidden sm:block">
            <p className="text-xs text-quantum-muted">Preços registrados</p>
            <p className="text-2xl font-bold text-quantum-fg mt-1">{observations.length}</p>
          </div>
        </div>
      )}

      {/* Inteligência de preços (aparece quando há observações registradas) */}
      <PriceIntelligencePanel
        observations={observations}
        activeList={lists.find((l) => l.status !== 'done' && l.items.length > 0) ?? null}
        onShowPriceHistory={handleShowPriceHistory}
      />

      {/* Lists */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
        </div>
      ) : lists.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <ShoppingCart size={40} className="text-quantum-border mx-auto" />
          <p className="text-quantum-muted">Nenhuma lista criada ainda.</p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-blue-400 border border-blue-400/30 rounded-lg hover:bg-blue-500/10 transition-colors"
          >
            <Plus size={14} /> Criar primeira lista
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Active lists first, done at bottom */}
          {[...lists].sort((a, b) => {
            const order = { open: 0, in_progress: 1, done: 2 };
            return order[a.status] - order[b.status];
          }).map((list) => {
            const checkedCount = list.items.filter((it) => it.checked).length;
            const totalItems = list.items.length;
            return (
              <div
                key={list.id}
                className={`bg-quantum-card border rounded-xl p-4 cursor-pointer hover:border-blue-500/40 transition-all group ${
                  list.status === 'done' ? 'border-quantum-border/50 opacity-70' : 'border-quantum-border'
                }`}
                onClick={() => setSelectedListId(list.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {STATUS_ICON[list.status]}
                      <span className="font-medium text-quantum-fg truncate">{list.name}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-quantum-muted">
                      <span>{STATUS_LABEL[list.status]}</span>
                      {list.scheduledDate && (
                        <span className="flex items-center gap-1">
                          <Calendar size={10} />
                          {new Date(list.scheduledDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </span>
                      )}
                      <span>{totalItems} {totalItems === 1 ? 'item' : 'itens'}</span>
                    </div>
                    {totalItems > 0 && (
                      <div className="mt-2">
                        <div className="w-full bg-quantum-bg rounded-full h-1.5">
                          <div
                            className="bg-blue-500 h-1.5 rounded-full transition-all"
                            style={{ width: `${totalItems > 0 ? (checkedCount / totalItems) * 100 : 0}%` }}
                          />
                        </div>
                        <p className="text-xs text-quantum-muted mt-1">{checkedCount}/{totalItems} comprados</p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-quantum-fg font-mono font-medium text-sm">
                      {formatBRL(list.estimatedTotalCents)}
                    </span>
                    {list.actualTotalCents !== undefined && list.actualTotalCents > 0 && (
                      <span className="text-xs text-green-400 font-mono">
                        real: {formatBRL(list.actualTotalCents)}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteList(list.id, list.name); }}
                      className="text-quantum-muted hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <ShoppingListForm
          onSave={handleCreateList}
          onClose={() => setShowForm(false)}
        />
      )}
      {showNfceImport && (
        <NfceImportPanel
          onClose={() => setShowNfceImport(false)}
          onRecordObservation={addObservation}
        />
      )}
      {priceHistoryProduct && (
        <PriceHistoryPanel
          productName={priceHistoryProduct}
          observations={forProduct(priceHistoryProduct)}
          onClose={() => setPriceHistoryProduct(null)}
        />
      )}
    </div>
  );
}
