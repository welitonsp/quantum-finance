import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Save, AlertCircle, TrendingDown, TrendingUp,
  Calendar, DollarSign, Tag, FileText, CheckCircle, Plus,
} from 'lucide-react';
import { ALLOWED_CATEGORIES } from '../../shared/schemas/financialSchemas';
import type { Transaction } from '../../shared/types/transaction';
import { formatBRL, fromCentavos, toCentavos } from '../../shared/types/money';
import { isIncome } from '../../utils/transactionUtils';
import { useCategories } from '../../hooks/useCategories';
import { normalizeCategoryName, type UserCategory } from '../../shared/schemas/categorySchemas';

interface CatMeta { emoji: string; color: string }
const CAT_META: Record<string, CatMeta> = {
  'Alimentação':    { emoji: '🍽️',  color: 'from-orange-500/20 to-orange-600/10 border-orange-500/30 text-orange-300'  },
  'Transporte':     { emoji: '🚗',  color: 'from-blue-500/20 to-blue-600/10 border-blue-500/30 text-blue-300'           },
  'Assinaturas':    { emoji: '📱',  color: 'from-purple-500/20 to-purple-600/10 border-purple-500/30 text-purple-300'  },
  'Educação':       { emoji: '📚',  color: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30 text-cyan-300'           },
  'Saúde':          { emoji: '❤️',  color: 'from-rose-500/20 to-rose-600/10 border-rose-500/30 text-rose-300'           },
  'Moradia':        { emoji: '🏠',  color: 'from-yellow-500/20 to-yellow-600/10 border-yellow-500/30 text-yellow-300'  },
  'Impostos/Taxas': { emoji: '📋',  color: 'from-red-500/20 to-red-600/10 border-red-500/30 text-red-300'               },
  'Lazer':          { emoji: '🎮',  color: 'from-pink-500/20 to-pink-600/10 border-pink-500/30 text-pink-300'           },
  'Vestuário':      { emoji: '👗',  color: 'from-violet-500/20 to-violet-600/10 border-violet-500/30 text-violet-300'  },
  'Salário':        { emoji: '💰',  color: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 text-emerald-300' },
  'Freelance':      { emoji: '💼',  color: 'from-teal-500/20 to-teal-600/10 border-teal-500/30 text-teal-300'           },
  'Investimento':   { emoji: '📈',  color: 'from-lime-500/20 to-lime-600/10 border-lime-500/30 text-lime-300'           },
  'Diversos':       { emoji: '📦',  color: 'from-slate-500/20 to-slate-600/10 border-slate-500/30 text-quantum-fg'       },
  'Outros':         { emoji: '•',   color: 'from-slate-500/20 to-slate-600/10 border-slate-500/30 text-quantum-fg'       },
};

function formatCurrencyDisplay(raw: string): string | null {
  if (!raw.trim()) return null;
  try {
    const cents = toCentavos(raw);
    if (cents <= 0) return null;
    return formatBRL(cents);
  } catch {
    return null;
  }
}

function formatFormMoney(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '';
  return value.toFixed(2).replace('.', ',');
}

const backdropVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 } };
const panelVariants = {
  hidden:  { opacity: 0, y: 40,  scale: 0.97 },
  visible: { opacity: 1, y: 0,   scale: 1,   transition: { type: 'spring' as const, stiffness: 340, damping: 28 } },
  exit:    { opacity: 0, y: 24,  scale: 0.96, transition: { duration: 0.18 } },
};

// ─── TypeToggle ───────────────────────────────────────────────────────────────
interface TypeToggleProps { value: 'entrada' | 'saida'; onChange: (v: 'entrada' | 'saida') => void }
function TypeToggle({ value, onChange }: TypeToggleProps) {
  return (
    <div className="flex rounded-xl overflow-hidden border border-quantum-border bg-quantum-card/50 p-0.5 gap-0.5">
      {([
        { val: 'saida'   as const, label: 'Despesa', Icon: TrendingDown, active: 'bg-red-500/20 border-red-500/40 text-red-300'           },
        { val: 'entrada' as const, label: 'Receita', Icon: TrendingUp,   active: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' },
      ]).map(({ val, label, Icon, active }) => (
        <button
          key={val} type="button" onClick={() => onChange(val)}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-bold transition-all duration-200 border ${value === val ? `${active} shadow-sm` : 'border-transparent text-quantum-fgMuted hover:text-quantum-fg'}`}
        >
          <Icon className="w-4 h-4" />{label}
        </button>
      ))}
    </div>
  );
}

// ─── CategoryPicker ───────────────────────────────────────────────────────────
interface CategoryPickerProps {
  value:      string;
  onChange:   (v: string) => void;
  categories: UserCategory[];
  search: string;
  onSearchChange: (value: string) => void;
}
function CategoryPicker({ value, onChange, categories, search, onSearchChange }: CategoryPickerProps) {
  const normalizedSearch = normalizeCategoryName(search);
  const visibleCategories = categories.filter(category =>
    !normalizedSearch || category.normalizedName.includes(normalizedSearch),
  );
  const selectedCategory = categories.find(category => category.name === value);
  const selectedAlreadyVisible = visibleCategories.some(category => category.name === value);
  const displayCategories = selectedCategory && !selectedAlreadyVisible
    ? [selectedCategory, ...visibleCategories]
    : visibleCategories;

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          type="search"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Buscar categoria..."
          className="input-quantum w-full pr-9 text-xs py-2"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            title="Limpar busca de categoria"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-quantum-fgMuted hover:text-quantum-fg hover:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {displayCategories.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-52 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {displayCategories.map(cat => {
            const meta     = CAT_META[cat.name] ?? CAT_META['Outros']!;
            const icon     = cat.icon ?? meta.emoji;
            const isActive = value === cat.name;
            return (
              <button
                key={cat.id ?? cat.normalizedName} type="button" onClick={() => onChange(cat.name)}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold border transition-all duration-150 bg-gradient-to-br ${meta.color} ${isActive ? 'ring-2 ring-offset-1 ring-offset-slate-900 ring-white/20 scale-[1.03] shadow-md' : 'opacity-60 hover:opacity-90'}`}
              >
                <span className="text-sm leading-none">{icon}</span>
                <span className="truncate">{cat.name}</span>
                {isActive && <CheckCircle className="w-3 h-3 ml-auto shrink-0" />}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-quantum-border bg-white/[0.03] px-3 py-4 text-center text-xs text-quantum-fgMuted">
          Nenhuma categoria encontrada.
        </div>
      )}
    </div>
  );
}

// ─── Main Form ────────────────────────────────────────────────────────────────
interface FormData {
  description: string;
  value: string;
  type: 'entrada' | 'saida';
  category: string;
  date: string;
}

interface Props {
  uid: string;
  onSave: (tx: Partial<Transaction>) => Promise<void>;
  editingTransaction: Transaction | null;
  onCancelEdit: () => void;
}

export default function TransactionForm({ uid, onSave, editingTransaction, onCancelEdit }: Props) {
  const isEditing = Boolean(editingTransaction);
  const {
    categories,
    loading: loadingCategories,
    error: categoriesError,
    addCategory,
  } = useCategories(uid);

  const [formData, setFormData] = useState<FormData>({
    description: '',
    value:       '',
    type:        'saida',
    category:    ALLOWED_CATEGORIES[0],
    date:        new Date().toISOString().substring(0, 10),
  });

  const [newCatMode,  setNewCatMode]  = useState(false);
  const [newCatName,  setNewCatName]  = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const newCatRef = useRef<HTMLInputElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error,        setError]        = useState('');
  const [saved,        setSaved]        = useState(false);
  const descRef = useRef<HTMLInputElement>(null);

  const filteredCategories = useMemo(() => {
    const allowed = categories.filter(category =>
      category.type === 'ambos' || category.type === formData.type,
    );

    if (
      formData.category &&
      !allowed.some(category => category.name === formData.category)
    ) {
      return [
        ...allowed,
        {
          id: `legacy-${formData.category}`,
          uid,
          name: formData.category,
          normalizedName: formData.category.toLowerCase(),
          type: 'ambos' as const,
          color: '#64748b',
          icon: CAT_META[formData.category]?.emoji ?? '•',
          isDefault: false,
          isActive: true,
        },
      ];
    }

    return allowed;
  }, [categories, formData.category, formData.type, uid]);

  useEffect(() => {
    if (editingTransaction) {
      const cat = editingTransaction.category ?? ALLOWED_CATEGORIES[0];
      const editValue = editingTransaction.value_cents !== undefined
        ? fromCentavos(editingTransaction.value_cents)
        : editingTransaction.value;
      setFormData({
        description: editingTransaction.description ?? '',
        value:       formatFormMoney(editValue),
        type:        isIncome(editingTransaction.type) ? 'entrada' : 'saida',
        category:    cat,
        date:        typeof editingTransaction.date === 'string'
          ? editingTransaction.date.substring(0, 10)
          : new Date().toISOString().substring(0, 10),
      });
    }
  }, [editingTransaction]);

  // Focus the new-category input whenever the inline form opens
  useEffect(() => {
    if (newCatMode) {
      const t = setTimeout(() => newCatRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [newCatMode]);

  useEffect(() => {
    const t = setTimeout(() => descRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancelEdit(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancelEdit]);

  const setField = useCallback(<K extends keyof FormData>(name: K, val: FormData[K]) => {
    setFormData(prev => ({ ...prev, [name]: val }));
    setError('');
  }, []);

  const handleTypeChange = useCallback((type: 'entrada' | 'saida') => {
    setFormData(prev => {
      const current = categories.find(category => category.name === prev.category);
      if (current && (current.type === 'ambos' || current.type === type)) {
        return { ...prev, type };
      }

      const firstCompatible = categories.find(category =>
        category.type === 'ambos' || category.type === type,
      );
      return { ...prev, type, category: firstCompatible?.name ?? prev.category };
    });
    setError('');
  }, [categories]);

  const confirmNewCategory = useCallback(async () => {
    const name = newCatName.trim();
    if (!name) return;
    try {
      const created = await addCategory(name, formData.type);
      setField('category', created.name);
      setCategorySearch('');
      setNewCatName('');
      setNewCatMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar categoria.');
    }
  }, [addCategory, formData.type, newCatName, setField]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setField(e.target.name as keyof FormData, e.target.value as FormData[keyof FormData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!formData.description.trim()) {
      setError('A descrição é obrigatória.');
      descRef.current?.focus();
      return;
    }
    let valueCents: ReturnType<typeof toCentavos>;
    try {
      valueCents = toCentavos(formData.value);
    } catch {
      setError('Insira um valor monetario valido.');
      return;
    }

    if (valueCents <= 0) {
      setError('Insira um valor válido maior que zero.');
      return;
    }

    const value = fromCentavos(valueCents);

    setIsSubmitting(true); setError('');
    try {
      await onSave({ ...formData, value, value_cents: valueCents });
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao guardar transação.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isReceita     = formData.type === 'entrada';
  const displayAmount = formatCurrencyDisplay(formData.value);
  const descLen       = formData.description.length;

  return (
    <motion.div
      variants={backdropVariants} initial="hidden" animate="visible" exit="hidden"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(2,6,23,0.82)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancelEdit(); }}
    >
      <motion.div
        variants={panelVariants} initial="hidden" animate="visible" exit="exit"
        className="relative w-full sm:max-w-lg bg-[#0d1424] border border-quantum-border rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden"
        style={{ boxShadow: '0 0 60px rgba(0,230,138,0.08), 0 25px 50px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: isReceita ? 'linear-gradient(90deg,transparent,#00E68A,transparent)' : 'linear-gradient(90deg,transparent,#ef4444,transparent)' }}
        />

        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isReceita ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
              {isReceita ? <TrendingUp className="w-5 h-5 text-emerald-400" /> : <TrendingDown className="w-5 h-5 text-red-400" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-quantum-fg leading-tight">{isEditing ? 'Editar Transação' : 'Nova Transação'}</h2>
              {displayAmount && (
                <span className={`text-sm font-semibold ${isReceita ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isReceita ? '+' : '-'}{displayAmount}
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={onCancelEdit} className="w-8 h-8 rounded-lg flex items-center justify-center text-quantum-fgMuted hover:text-quantum-fg hover:bg-white/10 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className="mx-6 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2.5 text-red-400 text-sm overflow-hidden"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={(e) => void handleSubmit(e)} className="px-6 pb-6 space-y-5">
          <div>
            <label className="block text-[10px] font-bold text-quantum-fgMuted uppercase tracking-widest mb-2">Tipo</label>
            <TypeToggle value={formData.type} onChange={handleTypeChange} />
          </div>

          <div>
            <label className="flex items-center justify-between text-[10px] font-bold text-quantum-fgMuted uppercase tracking-widest mb-2">
              <span className="flex items-center gap-1.5"><FileText className="w-3 h-3" /> Descrição</span>
              <span className={descLen > 80 ? 'text-amber-400' : 'text-slate-600'}>{descLen}/100</span>
            </label>
            <input ref={descRef} type="text" name="description" value={formData.description} onChange={handleChange}
              maxLength={100} placeholder="Ex: Supermercado Extra" className="input-quantum w-full" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-bold text-quantum-fgMuted uppercase tracking-widest mb-2">
                <DollarSign className="w-3 h-3" /> Valor (R$)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-quantum-fgMuted text-sm font-semibold">R$</span>
                <input type="text" inputMode="decimal" name="value" value={formData.value} onChange={handleChange}
                  placeholder="0,00" className="input-quantum w-full pl-9" />
              </div>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-bold text-quantum-fgMuted uppercase tracking-widest mb-2">
                <Calendar className="w-3 h-3" /> Data
              </label>
              <input type="date" name="date" value={formData.date} onChange={handleChange} className="input-quantum w-full" />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-[10px] font-bold text-quantum-fgMuted uppercase tracking-widest mb-2">
              <Tag className="w-3 h-3" /> Categoria
              <span className="ml-auto text-slate-600 normal-case text-[10px]">
                {loadingCategories ? 'Carregando…' : `${CAT_META[formData.category]?.emoji ?? '•'} ${formData.category}`}
              </span>
            </label>
            <CategoryPicker
              value={formData.category}
              onChange={v => setField('category', v)}
              categories={filteredCategories}
              search={categorySearch}
              onSearchChange={setCategorySearch}
            />
            {categoriesError && (
              <p className="mt-1.5 text-[10px] text-amber-400">
                Não foi possível carregar categorias salvas. Usando categorias padrão.
              </p>
            )}

            {/* ── Nova categoria inline ──────────────────────────────── */}
            <AnimatePresence initial={false}>
              {newCatMode ? (
                <motion.div
                  key="new-cat-input"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex gap-2 mt-2">
                    <input
                      ref={newCatRef}
                      type="text"
                      value={newCatName}
                      onChange={e => setNewCatName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter')  { e.preventDefault(); void confirmNewCategory(); }
                        if (e.key === 'Escape') { e.stopPropagation(); setNewCatMode(false); setNewCatName(''); }
                      }}
                      placeholder="Nome da categoria…"
                      maxLength={40}
                      className="input-quantum flex-1 text-xs py-1.5"
                    />
                    <button
                      type="button"
                      onClick={() => void confirmNewCategory()}
                      disabled={!newCatName.trim() || loadingCategories}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Confirmar"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setNewCatMode(false); setNewCatName(''); }}
                      className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-quantum-border text-quantum-fgMuted hover:text-quantum-fg transition-colors"
                      title="Cancelar"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.button
                  key="new-cat-btn"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  type="button"
                  onClick={() => setNewCatMode(true)}
                  className="mt-1.5 flex items-center gap-1 text-[10px] text-quantum-accent hover:underline font-bold"
                >
                  <Plus className="w-3 h-3" /> Nova categoria
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onCancelEdit} className="btn-quantum-secondary flex-1 py-3 text-sm">Cancelar</button>
            <button type="submit" disabled={isSubmitting}
              className={`flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${saved ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-300' : 'btn-quantum-primary'}`}>
              {saved ? (
                <><CheckCircle className="w-4 h-4" /> Guardado!</>
              ) : isSubmitting ? (
                <><span className="w-4 h-4 border-2 border-slate-900/50 border-t-slate-900 rounded-full animate-spin" /> A guardar...</>
              ) : (
                <><Save className="w-4 h-4" /> {isEditing ? 'Atualizar' : 'Guardar'}</>
              )}
            </button>
          </div>

          <p className="text-center text-[10px] text-slate-700 -mt-2">
            Pressione <kbd className="px-1 py-0.5 bg-quantum-bgSecondary rounded text-quantum-fgMuted">Esc</kbd> para fechar
          </p>
        </form>
      </motion.div>
    </motion.div>
  );
}
