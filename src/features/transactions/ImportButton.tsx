// src/features/transactions/ImportButton.tsx
// Fluxo de estados: idle → parsing → [col_mapping] → ai_processing → preview → importing → success | error | reconciliation
import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud, Loader2, AlertTriangle, CheckCircle2,
  X, FileUp, BrainCircuit, ChevronDown, ArrowRight,
  CheckSquare, Square, RotateCcw, Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { useParserWorker } from '../../shared/lib/useParserWorker';
import { batchCategorizeDescriptions } from '../../utils/aiCategorize';
import { ALLOWED_CATEGORIES, transactionCreateSchema } from '../../shared/schemas/financialSchemas';
import { CATEGORY_KEYWORDS } from '../../shared/data/categoryKeywords';
import ReconciliationEngine from './ReconciliationEngine';
import type { Transaction } from '../../shared/types/transaction';
import type { AllowedCategory } from '../../shared/schemas/financialSchemas';
import { getTransactionAbsCentavos, isIncome, isExpense } from '../../utils/transactionUtils';
import { fromCentavos, toCentavos, type Centavos } from '../../shared/types/money';

// ─── Types ────────────────────────────────────────────────────────────────────
type ImportStatus =
  | 'idle' | 'parsing' | 'col_mapping' | 'ai_processing'
  | 'preview' | 'importing' | 'success' | 'error' | 'reconciliation';

interface ParsedTransaction extends Omit<Transaction, 'id'> {
  id:              string;
  _selected?:      boolean;
  _aiCategorized?: boolean;
}

interface ColMapState {
  headers:     string[];
  previewRows: string[][];
  autoMap:     { dateIdx: number; descIdx: number; valueIdx: number };
  file:        File;
}

interface ImportStats {
  total:      number;
  added:      number;
  duplicates: number;
}

interface ImportResult {
  added?:      number;
  duplicates?: number;
}

interface ColumnMapping {
  dateIdx:  number;
  descIdx:  number;
  valueIdx: number;
}

interface ParseError extends Error {
  code?:       string;
  headers?:    string[];
  previewRows?: string[][];
  autoMap?:    { dateIdx: number; descIdx: number; valueIdx: number };
}

interface Props {
  onImportTransactions: (txs: ParsedTransaction[]) => Promise<ImportResult | void>;
  uid?:                  string | undefined;
  existingTransactions?: Transaction[];
  userRules?:            import('../../hooks/useCategoryRules').UserCategoryRule[] | undefined;
}


const CAT_COLORS: Record<string, string> = {
  'Alimentação':    'text-amber-400  bg-amber-400/10  border-amber-400/20',
  'Transporte':     'text-blue-400   bg-blue-400/10   border-blue-400/20',
  'Assinaturas':    'text-cyan-400   bg-cyan-400/10   border-cyan-400/20',
  'Saúde':          'text-rose-400   bg-rose-400/10   border-rose-400/20',
  'Moradia':        'text-orange-400 bg-orange-400/10 border-orange-400/20',
  'Educação':       'text-indigo-400 bg-indigo-400/10 border-indigo-400/20',
  'Lazer':          'text-pink-400   bg-pink-400/10   border-pink-400/20',
  'Salário':        'text-quantum-accent bg-quantum-accent/10 border-quantum-accent/20',
  'Investimento':   'text-quantum-accent bg-quantum-accent/10 border-quantum-accent/20',
  'Impostos/Taxas': 'text-red-400    bg-red-400/10    border-red-400/20',
  'Vestuário':      'text-purple-400 bg-purple-400/10 border-purple-400/20',
  'Freelance':      'text-teal-400   bg-teal-400/10   border-teal-400/20',
  'Diversos':       'text-quantum-fgMuted bg-white/5   border-quantum-border',
  'Outros':         'text-quantum-fgMuted bg-white/5   border-quantum-border',
};
const catClass = (cat: string | undefined): string =>
  CAT_COLORS[cat ?? 'Diversos'] ?? CAT_COLORS['Diversos']!;

// ─── StepBar ─────────────────────────────────────────────────────────────────
const STEPS = ['Ficheiro', 'Categorizar', 'Pré-visualizar', 'Importar'];
const STEP_MAP: Partial<Record<ImportStatus, number>> = {
  parsing: 0, col_mapping: 0, ai_processing: 1, preview: 2, importing: 3,
};

function StepBar({ current }: { current: ImportStatus }) {
  const active = STEP_MAP[current] ?? -1;
  return (
    <div className="flex items-center gap-1 px-6 py-3 bg-quantum-bg/50 border-b border-quantum-border">
      {STEPS.map((label, i) => (
        <React.Fragment key={label}>
          <div className="flex items-center gap-1.5">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black transition-all duration-300 ${
              i < active   ? 'bg-quantum-accent text-quantum-bg' :
              i === active ? 'bg-quantum-accent/20 border border-quantum-accent text-quantum-accent animate-pulse' :
                             'bg-quantum-bgSecondary border border-quantum-border text-quantum-fgMuted'
            }`}>
              {i < active ? '✓' : i + 1}
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${
              i === active ? 'text-quantum-accent' : i < active ? 'text-quantum-fg' : 'text-quantum-fgMuted'
            }`}>{label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-px transition-all duration-500 ${i < active ? 'bg-quantum-accent/50' : 'bg-quantum-border'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── DropZone ─────────────────────────────────────────────────────────────────
interface DropZoneProps {
  onFile: (f: File) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}
function DropZone({ onFile, fileInputRef }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); }}
      onClick={() => fileInputRef.current?.click()}
      className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center text-center cursor-pointer transition-all duration-300 ${
        dragging
          ? 'border-quantum-accent bg-quantum-accent/5 scale-[1.01]'
          : 'border-quantum-border hover:border-quantum-accent/40 hover:bg-white/[0.02]'
      }`}
    >
      <input
        type="file" ref={fileInputRef} className="hidden" accept=".csv,.ofx,.pdf"
        onChange={e => { if (e.target.files?.[0]) onFile(e.target.files[0]); }}
      />
      <motion.div
        animate={dragging ? { scale: 1.1 } : { scale: 1 }}
        className="w-16 h-16 rounded-2xl bg-quantum-bgSecondary border border-quantum-border flex items-center justify-center mb-5"
      >
        <UploadCloud className={`w-8 h-8 transition-colors ${dragging ? 'text-quantum-accent' : 'text-quantum-fgMuted'}`} />
      </motion.div>
      <p className="font-bold text-quantum-fg mb-1.5">
        {dragging ? 'Largar aqui!' : 'Arraste o seu extrato'}
      </p>
      <p className="text-xs text-quantum-fgMuted max-w-xs leading-relaxed">
        Formatos suportados: <span className="text-quantum-fg font-mono">CSV</span>,{' '}
        <span className="text-quantum-fg font-mono">OFX</span> e{' '}
        <span className="text-quantum-fg font-mono">PDF</span>.
        Processado localmente — o Motor Gemini categoriza automaticamente.
      </p>
      <div className="mt-5 flex gap-2">
        {['CSV','OFX','PDF'].map(f => (
          <span key={f} className="text-[10px] font-mono font-bold px-2.5 py-1 bg-quantum-bgSecondary border border-quantum-border rounded-lg text-quantum-fgMuted">
            .{f.toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── LoadingPanel ─────────────────────────────────────────────────────────────
type LoadingStatus = 'parsing' | 'ai_processing' | 'importing';
const LOADING_MSGS: Record<LoadingStatus, { title: string; sub: string }> = {
  parsing:       { title: 'A Extrair Dados...',    sub: 'A ler e filtrar duplicados do extrato.' },
  ai_processing: { title: 'Deep Scan Gemini Ativo', sub: 'A categorizar despesas desconhecidas com IA.' },
  importing:     { title: 'A Sincronizar com o Cofre', sub: 'A gravar as transações no Firestore.' },
};
function LoadingPanel({ status }: { status: LoadingStatus }) {
  const msg = LOADING_MSGS[status] ?? { title: 'A processar...', sub: '' };
  return (
    <div className="py-14 flex flex-col items-center text-center gap-4">
      <div className="relative">
        <div className="absolute inset-0 bg-quantum-accent/20 rounded-full blur-2xl animate-pulse" />
        {status === 'ai_processing'
          ? <BrainCircuit className="w-14 h-14 text-quantum-accent relative z-10 animate-pulse" />
          : <Loader2 className="w-14 h-14 text-quantum-accent relative z-10 animate-spin" />
        }
      </div>
      <div>
        <h4 className="text-sm font-black text-quantum-fg tracking-widest uppercase mb-1">{msg.title}</h4>
        <p className="text-xs text-quantum-fgMuted">{msg.sub}</p>
      </div>
    </div>
  );
}

// ─── ColumnMapper ─────────────────────────────────────────────────────────────
interface ColumnMapperProps {
  headers:     string[];
  previewRows: string[][];
  autoMap:     ColumnMapping;
  onApply:     (m: ColumnMapping) => void;
  onCancel:    () => void;
}
function ColumnMapper({ headers, previewRows, autoMap, onApply, onCancel }: ColumnMapperProps) {
  const [mapping, setMapping] = useState<{ dateIdx: number | ''; descIdx: number | ''; valueIdx: number | '' }>({
    dateIdx:  autoMap.dateIdx  >= 0 ? autoMap.dateIdx  : '',
    descIdx:  autoMap.descIdx  >= 0 ? autoMap.descIdx  : '',
    valueIdx: autoMap.valueIdx >= 0 ? autoMap.valueIdx : '',
  });

  const set = (k: keyof typeof mapping, v: number | '') => setMapping(m => ({ ...m, [k]: v }));
  const ready = mapping.dateIdx !== '' && mapping.descIdx !== '' && mapping.valueIdx !== '';

  const FIELDS: { key: keyof typeof mapping; label: string; color: string }[] = [
    { key: 'dateIdx',  label: 'Coluna de Data',      color: 'text-cyan-400'       },
    { key: 'descIdx',  label: 'Coluna de Descrição',  color: 'text-quantum-fg'     },
    { key: 'valueIdx', label: 'Coluna de Valor',      color: 'text-quantum-accent' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="flex items-start gap-3 p-3.5 bg-quantum-goldDim border border-quantum-gold/20 rounded-xl">
        <AlertTriangle className="w-4 h-4 text-quantum-gold shrink-0 mt-0.5" />
        <p className="text-xs text-quantum-fg leading-relaxed">
          Não foi possível detetar automaticamente as colunas. Mapeie manualmente abaixo.
        </p>
      </div>

      <div className="space-y-3">
        {FIELDS.map(({ key, label, color }) => (
          <div key={key}>
            <label className={`text-xs font-bold uppercase tracking-wider mb-1.5 block ${color}`}>{label}</label>
            <select
              value={mapping[key]}
              onChange={e => set(key, e.target.value === '' ? '' : Number(e.target.value))}
              className="input-quantum appearance-none pr-8"
            >
              <option value="">— Selecionar coluna —</option>
              {headers.map((h, i) => (
                <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {previewRows.length > 0 && (
        <div>
          <p className="text-xs text-quantum-fgMuted uppercase tracking-wider mb-2">
            Pré-visualização (primeiras {previewRows.length} linhas)
          </p>
          <div className="overflow-x-auto rounded-xl border border-quantum-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-quantum-bgSecondary">
                  {headers.map((h, i) => (
                    <th key={i} className={`px-3 py-2 text-left font-bold border-b border-quantum-border truncate max-w-[100px] ${
                      i === Number(mapping.dateIdx)  ? 'text-cyan-400' :
                      i === Number(mapping.descIdx)  ? 'text-quantum-fg' :
                      i === Number(mapping.valueIdx) ? 'text-quantum-accent' :
                      'text-quantum-fgMuted'
                    }`}>{h || `Col ${i+1}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, ri) => (
                  <tr key={ri} className="border-b border-quantum-border/50 last:border-0">
                    {row.map((cell, ci) => (
                      <td key={ci} className={`px-3 py-2 truncate max-w-[100px] ${
                        ci === Number(mapping.dateIdx)  ? 'text-cyan-400  font-mono' :
                        ci === Number(mapping.descIdx)  ? 'text-quantum-fg' :
                        ci === Number(mapping.valueIdx) ? 'text-quantum-accent font-mono' :
                        'text-quantum-fgMuted'
                      }`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button onClick={onCancel} className="btn-quantum-secondary flex-1">Cancelar</button>
        <button
          onClick={() => {
            if (ready) {
              onApply({
                dateIdx:  Number(mapping.dateIdx),
                descIdx:  Number(mapping.descIdx),
                valueIdx: Number(mapping.valueIdx),
              });
            }
          }}
          disabled={!ready}
          className="btn-quantum-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ArrowRight className="w-4 h-4" /> Aplicar Mapeamento
        </button>
      </div>
    </motion.div>
  );
}

// ─── PreviewPanel ─────────────────────────────────────────────────────────────
interface PreviewItem extends ParsedTransaction { _selected: boolean }
interface PreviewPanelProps {
  transactions: ParsedTransaction[];
  onConfirm:    (txs: ParsedTransaction[]) => void;
  onCancel:     () => void;
}
function PreviewPanel({ transactions, onConfirm, onCancel }: PreviewPanelProps) {
  const [items, setItems]       = useState<PreviewItem[]>(() => transactions.map(tx => ({ ...tx, _selected: true })));
  const [editingId, setEditingId] = useState<string | null>(null);

  const selected   = items.filter(t => t._selected);
  const allChecked = selected.length === items.length;

  const toggle    = (id: string) => setItems(prev => prev.map(t => t.id === id ? { ...t, _selected: !t._selected } : t));
  const toggleAll = () => setItems(prev => prev.map(t => ({ ...t, _selected: !allChecked })));
  const setCat    = (id: string, cat: string) => setItems(prev => prev.map(t => t.id === id ? { ...t, category: cat } : t));

  const totEntry = selected
    .filter(t => isIncome(t.type))
    .reduce((a, t) => a + fromCentavos(getTransactionAbsCentavos(t)), 0);
  const totExit = selected
    .filter(t => isExpense(t.type))
    .reduce((a, t) => a + fromCentavos(getTransactionAbsCentavos(t)), 0);

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

      <div>
        <div className="flex items-center justify-between mb-2">
          <button onClick={toggleAll} className="flex items-center gap-2 text-xs text-quantum-fgMuted hover:text-quantum-fg transition-colors">
            {allChecked ? <CheckSquare className="w-4 h-4 text-quantum-accent" /> : <Square className="w-4 h-4" />}
            {allChecked ? 'Desmarcar tudo' : 'Selecionar tudo'}
          </button>
          <span className="text-xs text-quantum-fgMuted">
            <span className="text-quantum-accent font-bold">{selected.length}</span> / {items.length} selecionadas
          </span>
        </div>

        <div className="border border-quantum-border rounded-xl overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-quantum-bg z-10">
              <tr className="border-b border-quantum-border">
                <th className="w-8 px-3 py-2" />
                <th className="px-3 py-2 text-left text-quantum-fgMuted font-bold uppercase tracking-wider">Data</th>
                <th className="px-3 py-2 text-left text-quantum-fgMuted font-bold uppercase tracking-wider">Descrição</th>
                <th className="px-3 py-2 text-left text-quantum-fgMuted font-bold uppercase tracking-wider">Categoria</th>
                <th className="px-3 py-2 text-right text-quantum-fgMuted font-bold uppercase tracking-wider">Valor</th>
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
                      <button onClick={() => toggle(tx.id)} className="flex items-center justify-center w-full">
                        {tx._selected
                          ? <CheckSquare className="w-3.5 h-3.5 text-quantum-accent" />
                          : <Square     className="w-3.5 h-3.5 text-quantum-fgMuted" />
                        }
                      </button>
                    </td>
                    <td className="px-3 py-2 font-mono text-quantum-fgMuted whitespace-nowrap">{tx.date}</td>
                    <td className="px-3 py-2 text-quantum-fg max-w-[140px] truncate" title={tx.description}>
                      {tx.description}
                    </td>
                    <td className="px-3 py-2">
                      {editingId === tx.id ? (
                        <select
                          autoFocus
                          value={tx.category ?? ''}
                          onChange={e => { setCat(tx.id, e.target.value); setEditingId(null); }}
                          onBlur={() => setEditingId(null)}
                          className="bg-quantum-bgSecondary border border-quantum-accent/30 rounded-lg px-1 py-0.5 text-[10px] text-quantum-fg outline-none"
                        >
                          {ALLOWED_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <button
                          onClick={() => setEditingId(tx.id)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold transition-all hover:opacity-80 ${catClass(tx.category)}`}
                          title="Clique para editar"
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

// ─── SuccessPanel ─────────────────────────────────────────────────────────────
function SuccessPanel({ stats }: { stats: ImportStats }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="py-10 flex flex-col items-center text-center gap-5"
    >
      <div className="relative">
        <div className="absolute inset-0 bg-quantum-accent/20 rounded-full blur-2xl" />
        <CheckCircle2 className="w-16 h-16 text-quantum-accent relative z-10" />
      </div>
      <div>
        <h4 className="text-lg font-black text-quantum-fg mb-1">Ingestão Concluída</h4>
        <p className="text-xs text-quantum-fgMuted">O cofre foi atualizado com sucesso.</p>
      </div>
      <div className="flex gap-3">
        <div className="px-4 py-2.5 bg-quantum-bgSecondary rounded-xl border border-quantum-border text-center">
          <p className="text-[10px] text-quantum-fgMuted uppercase mb-1">Lidas</p>
          <p className="text-lg font-black text-quantum-fg font-mono">{stats.total}</p>
        </div>
        <div className="px-4 py-2.5 bg-quantum-accentDim border border-quantum-accent/20 rounded-xl text-center">
          <p className="text-[10px] text-quantum-accent uppercase mb-1">Novas</p>
          <p className="text-lg font-black text-quantum-accent font-mono">{stats.added}</p>
        </div>
        <div className="px-4 py-2.5 bg-quantum-bgSecondary border border-quantum-border rounded-xl text-center">
          <p className="text-[10px] text-quantum-fgMuted uppercase mb-1">Ignoradas</p>
          <p className="text-lg font-black text-quantum-fgMuted font-mono">{stats.duplicates}</p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── ErrorPanel ───────────────────────────────────────────────────────────────
function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="py-10 flex flex-col items-center text-center gap-4"
    >
      <AlertTriangle className="w-14 h-14 text-quantum-red" />
      <div>
        <h4 className="text-base font-bold text-quantum-fg mb-2">Interferência Detetada</h4>
        <p className="text-xs text-quantum-fgMuted bg-quantum-redDim border border-quantum-red/20 p-3 rounded-xl max-w-sm mx-auto leading-relaxed">
          {message}
        </p>
      </div>
      <button onClick={onRetry} className="btn-quantum-secondary flex items-center gap-2">
        <RotateCcw className="w-3.5 h-3.5" /> Tentar Novamente
      </button>
    </motion.div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function ImportButton({ onImportTransactions, existingTransactions = [], userRules }: Props) {
  const [isOpen,              setIsOpen]              = useState(false);
  const [status,              setStatus]              = useState<ImportStatus>('idle');
  const [errorMessage,        setErrorMessage]        = useState('');
  const [preview,             setPreview]             = useState<ParsedTransaction[]>([]);
  const [stats,               setStats]               = useState<ImportStats>({ total: 0, added: 0, duplicates: 0 });
  const [colMapState,         setColMapState]         = useState<ColMapState | null>(null);
  const [reconciliationQueue, setReconciliationQueue] = useState<ParsedTransaction[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { parseFile, parseFileWithMapping } = useParserWorker();

  const deduplicate = useCallback((parsed: ParsedTransaction[]) => {
    const existingHashes = new Set<string>();
    existingTransactions.forEach(t => {
      const val  = getTransactionAbsCentavos(t);
      const desc = (t.description ?? '').substring(0, 12).toLowerCase().trim();
      const date = (t.date ?? '').substring(0, 10);
      existingHashes.add(`${date}-${val}-${desc}`);
    });

    let duplicates = 0;
    const fresh = parsed.filter(tx => {
      const val  = getTransactionAbsCentavos(tx);
      const desc = tx.description.substring(0, 12).toLowerCase().trim();
      const date = (tx.date ?? '').substring(0, 10);
      const hash = `${date}-${val}-${desc}`;
      if (existingHashes.has(hash)) { duplicates++; return false; }
      existingHashes.add(hash);
      return true;
    });

    return { fresh, duplicates };
  }, [existingTransactions]);

  const localCategorize = (txs: ParsedTransaction[]): ParsedTransaction[] => {
    const forAI: ParsedTransaction[] = [];
    txs.forEach(tx => {
      const upper = tx.description.toUpperCase();
      let found = false;
      // FIX P0.1: regras do usuário têm prioridade sobre dicionário
      for (const rule of (userRules ?? [])) {
        for (const kw of rule.keywords) {
          if (upper.includes(kw.toUpperCase())) {
            tx.category = rule.category as AllowedCategory; found = true; break;
          }
        }
        if (found) break;
      }
      if (!found) {
        for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
          for (const kw of keywords) {
            if (upper.includes(kw.toUpperCase())) {
              tx.category = category as AllowedCategory; found = true; break;
            }
          }
          if (found) break;
        }
      }
      if (!found && isExpense(tx.type)) forAI.push(tx);
    });
    return forAI;
  };

  const closeModal = () => {
    if (status === 'parsing' || status === 'ai_processing' || status === 'importing') return;
    setIsOpen(false);
    setStatus('idle');
    setPreview([]);
    setReconciliationQueue([]);
    setColMapState(null);
    setErrorMessage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processFile = useCallback(async (file: File, customMapping: ColumnMapping | null = null, pdfPassword: string | null = null): Promise<void> => {
    setStatus('parsing');
    setErrorMessage('');

    try {
      let parsed: ParsedTransaction[];
      try {
        parsed = customMapping
          ? await parseFileWithMapping(file, customMapping) as ParsedTransaction[]
          : await parseFile(file, pdfPassword ? { password: pdfPassword } : {}) as ParsedTransaction[];
      } catch (rawErr) {
        const err = rawErr as ParseError;
        if (err.code === 'COLUMNS_NOT_FOUND') {
          setColMapState({
            headers:     err.headers     ?? [],
            previewRows: err.previewRows ?? [],
            autoMap:     err.autoMap     ?? { dateIdx: -1, descIdx: -1, valueIdx: -1 },
            file,
          });
          setStatus('col_mapping');
          return;
        }
        if (err.message === 'PASSWORD_REQUIRED') {
          const pwd = window.prompt('Este PDF está protegido. Introduza a password:');
          if (pwd) { void processFile(file, null, pwd); return; }
          throw new Error('Password necessária para abrir este PDF.');
        }
        throw err;
      }

      if (!parsed || parsed.length === 0) throw new Error('Nenhuma transação válida encontrada no ficheiro.');

      const { fresh, duplicates } = deduplicate(parsed);
      if (fresh.length === 0) {
        toast('Todos os registos já existem no Cofre.', { icon: '🛡️' });
        setStats({ total: parsed.length, added: 0, duplicates });
        setStatus('success');
        setTimeout(() => closeModal(), 3000);
        return;
      }

      setStatus('ai_processing');
      // Local dictionary first — items not matched go to AI
      const forAI = localCategorize(fresh);

      if (forAI.length > 0) {
        // Extract unique descriptions for a single batch request (RULE: 1 request / file)
        const uniqueDescs = [...new Set(forAI.map(tx => tx.description).filter(Boolean))];
        const categoryMap = await batchCategorizeDescriptions(uniqueDescs);

        forAI.forEach(tx => {
          const aiCat = categoryMap[tx.description];
          if (aiCat) {
            tx.category       = aiCat;
            tx._aiCategorized = true;
          }
        });
      }

      setReconciliationQueue(fresh);
      setStats(prev => ({ ...prev, total: parsed.length, duplicates }));
      setStatus('reconciliation');

    } catch (rawErr) {
      const err = rawErr as Error;
      console.error('Importação falhou:', err);
      setErrorMessage(err.message || 'Falha desconhecida ao processar o ficheiro.');
      setStatus('error');
    }
  }, [deduplicate, parseFile, parseFileWithMapping]);  

  const handleConfirmImport = useCallback(async (selectedTxs: ParsedTransaction[]) => {
    setStatus('importing');
    try {
      const validated: Partial<Transaction>[] = [];
      let invalidCount = 0;

      for (const tx of selectedTxs) {
        const {
          id: previewId,
          value: legacyValue,
          _selected,
          _aiCategorized,
          ...rawTx
        } = tx;
        void previewId;
        void _selected;
        void _aiCategorized;

        const cleanTx = {
          ...rawTx,
          value_cents: rawTx.value_cents ?? toCentavos(legacyValue ?? 0),
          schemaVersion: 2,
          source: rawTx.source ?? 'csv',
        };

        const zodResult = transactionCreateSchema.safeParse(cleanTx);
        if (zodResult.success) {
          const parsedData = zodResult.data;
          const validData: Partial<Transaction> = {
            description: parsedData.description,
            value_cents: parsedData.value_cents as Centavos,
            type: parsedData.type,
            category: parsedData.category,
            date: parsedData.date,
            source: parsedData.source,
            schemaVersion: 2,
          };

          if (parsedData.account !== undefined) validData.account = parsedData.account;
          if (parsedData.accountId !== undefined) validData.accountId = parsedData.accountId;
          if (parsedData.cardId !== undefined) validData.cardId = parsedData.cardId;
          if (parsedData.fitId !== undefined) validData.fitId = parsedData.fitId;
          if (parsedData.tags !== undefined) validData.tags = parsedData.tags;
          if (parsedData.isRecurring !== undefined) validData.isRecurring = parsedData.isRecurring;
          validated.push(validData);
        } else {
          invalidCount++;
          console.warn('[Import] Transação rejeitada:', cleanTx, zodResult.error.issues);
        }
      }

      if (invalidCount > 0) {
        toast.error(`${invalidCount} transação(ões) inválida(s) ignorada(s).`);
      }

      if (validated.length === 0) {
        toast.error('Nenhuma transação válida para importar.');
        setStatus('idle');
        return;
      }

      const result = await onImportTransactions(validated as ParsedTransaction[]);
      const added      = result?.added      ?? selectedTxs.length;
      const duplicates = result?.duplicates ?? stats.duplicates;
      setStats(prev => ({ ...prev, added, duplicates }));
      setStatus('success');
      setTimeout(() => closeModal(), 3000);
    } catch (rawErr) {
      const err = rawErr as Error;
      console.error('Erro ao gravar no Firestore:', err);
      setErrorMessage(err.message || 'Falha ao guardar as transações. Tente novamente.');
      setStatus('error');
    }
  }, [onImportTransactions, stats.duplicates]);  

  const handleApplyMapping = useCallback((mapping: ColumnMapping) => {
    if (colMapState?.file) void processFile(colMapState.file, mapping);
  }, [colMapState, processFile]);

  const showStepBar = (['parsing','ai_processing','col_mapping','preview','importing'] as ImportStatus[]).includes(status);

  return (
    <>
      <button onClick={() => setIsOpen(true)} className="btn-quantum-secondary flex items-center gap-2">
        <FileUp className="w-4 h-4" />
        <span className="hidden sm:inline">Importar Ficheiro</span>
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {status === 'reconciliation' && (
            <ReconciliationEngine
              queue={reconciliationQueue}
              existingTransactions={existingTransactions}
              onComplete={(resolvedTxs: Transaction[]) => {
                void handleConfirmImport(resolvedTxs as ParsedTransaction[]);
              }}
              onCancel={() => {
                setReconciliationQueue([]);
                setStatus('idle');
                setIsOpen(false);
              }}
            />
          )}
        </AnimatePresence>,
        document.body
      )}

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isOpen && status !== 'reconciliation' && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className={`bg-quantum-card w-full max-h-[90vh] rounded-3xl border border-quantum-border shadow-[0_0_60px_rgba(0,0,0,0.6)] flex flex-col ${
                  status === 'preview' ? 'max-w-2xl' : 'max-w-lg'
                }`}
              >
              <div className="p-4 border-b border-quantum-border flex items-center justify-between bg-quantum-bg/60">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-quantum-accent/10 rounded-xl border border-quantum-accent/20">
                    <UploadCloud className="w-5 h-5 text-quantum-accent" />
                  </div>
                  <div>
                    <h3 className="font-black text-quantum-fg text-sm tracking-wide">Ingestão Quântica</h3>
                    <p className="text-[10px] text-quantum-fgMuted">CSV · OFX · PDF · IA Categorization</p>
                  </div>
                </div>
                {!(['parsing','ai_processing','importing'] as ImportStatus[]).includes(status) && (
                  <button onClick={closeModal} className="p-2 text-quantum-fgMuted hover:text-quantum-fg hover:bg-white/5 rounded-xl transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              {showStepBar && <StepBar current={status} />}

              <div className="p-6 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                <AnimatePresence mode="wait">
                  {status === 'idle' && (
                    <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <DropZone onFile={f => void processFile(f)} fileInputRef={fileInputRef} />
                    </motion.div>
                  )}

                  {(['parsing','ai_processing','importing'] as ImportStatus[]).includes(status) && (
                    <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <LoadingPanel status={status as LoadingStatus} />
                    </motion.div>
                  )}

                  {status === 'col_mapping' && colMapState && (
                    <motion.div key="col_mapping" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <ColumnMapper
                        headers={colMapState.headers}
                        previewRows={colMapState.previewRows}
                        autoMap={colMapState.autoMap}
                        onApply={handleApplyMapping}
                        onCancel={closeModal}
                      />
                    </motion.div>
                  )}

                  {status === 'preview' && (
                    <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <PreviewPanel
                        transactions={preview}
                        onConfirm={txs => void handleConfirmImport(txs)}
                        onCancel={() => setStatus('idle')}
                      />
                    </motion.div>
                  )}

                  {status === 'success' && (
                    <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <SuccessPanel stats={stats} />
                    </motion.div>
                  )}

                  {status === 'error' && (
                    <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <ErrorPanel message={errorMessage} onRetry={() => setStatus('idle')} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
