// src/features/transactions/ImportButton.tsx
// Fluxo de estados: idle → parsing → [col_mapping] → ai_processing → preview → importing → success | error | reconciliation
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, X, FileUp } from 'lucide-react';
import toast from 'react-hot-toast';

import { useParserWorker } from '../../shared/lib/useParserWorker';
import { batchCategorizeDescriptions } from '../../utils/aiCategorize';
import { ALLOWED_CATEGORIES } from '../../shared/schemas/financialSchemas';
import { CATEGORY_KEYWORDS } from '../../shared/data/categoryKeywords';
import { useCategories } from '../../hooks/useCategories';
import ReconciliationEngine from './ReconciliationEngine';
import type { Transaction } from '../../shared/types/transaction';
import type { AllowedCategory } from '../../shared/schemas/financialSchemas';
import { isExpense } from '../../utils/transactionUtils';
import { findImportCandidateTransactions } from './importCandidateSearch';

import type { ImportStatus, CrossPageStatus, ParsedTransaction, ColMapState, ImportStats, LoadingStatus, ParseError } from './import/importTypes';
import {
  EMPTY_IMPORT_STATS, CROSS_PAGE_CANDIDATE_TIMEOUT_MS,
  buildImportStats, buildImportDedupeFingerprint,
} from './import/importConstants';
import { processResolvedImportBatch } from './import/processResolvedImportBatch';
import { calculatePreviewTotals } from './import/importHelpers';
import { StepBar }      from './import/StepBar';
import { DropZone }     from './import/DropZone';
import { LoadingPanel } from './import/LoadingPanel';
import { ColumnMapper } from './import/ColumnMapper';
import { PreviewPanel } from './import/PreviewPanel';
import { SuccessPanel } from './import/SuccessPanel';
import { ErrorPanel }   from './import/ErrorPanel';
import { PasswordPanel } from './import/PasswordPanel';
import {
  getUserFriendlyErrorMessage,
  logSanitizedFirebaseError,
} from '../../shared/lib/firebaseErrorHandling';

// Re-export so existing test imports remain valid
export { processResolvedImportBatch, calculatePreviewTotals };

// ─── Props ────────────────────────────────────────────────────────────────────

interface ImportResult {
  added?:      number;
  duplicates?: number;
}

interface Props {
  onImportTransactions: (txs: ParsedTransaction[]) => Promise<ImportResult | void>;
  uid?:                 string | undefined;
  existingTransactions?: Transaction[];
  userRules?:           import('../../hooks/useCategoryRules').UserCategoryRule[] | undefined;
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function ImportButton({ onImportTransactions, uid, existingTransactions = [], userRules }: Props) {
  const [isOpen,              setIsOpen]              = useState(false);
  const [status,              setStatus]              = useState<ImportStatus>('idle');
  const [errorMessage,        setErrorMessage]        = useState('');
  const [preview,             setPreview]             = useState<ParsedTransaction[]>([]);
  const [stats,               setStats]               = useState<ImportStats>(EMPTY_IMPORT_STATS);
  const [colMapState,         setColMapState]         = useState<ColMapState | null>(null);
  const [reconciliationQueue, setReconciliationQueue] = useState<ParsedTransaction[]>([]);
  const [crossPageStatus,              setCrossPageStatus]              = useState<CrossPageStatus>('idle');
  const [crossPageMatchCount,          setCrossPageMatchCount]          = useState(0);
  const [crossPageMatchedFingerprints, setCrossPageMatchedFingerprints] = useState<Set<string>>(new Set());
  const [pdfPasswordFile,              setPdfPasswordFile]              = useState<File | null>(null);
  const [pdfPasswordWrong,             setPdfPasswordWrong]             = useState(false);

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const triggerRef     = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef       = useRef<HTMLDivElement>(null);

  const { categories: userCategories } = useCategories(uid ?? '');
  const { parseFile, parseFileWithMapping } = useParserWorker();

  const deduplicate = useCallback((parsed: ParsedTransaction[]) => {
    const existingHashes = new Set<string>();
    existingTransactions.forEach(t => {
      existingHashes.add(buildImportDedupeFingerprint(t));
    });

    let duplicates = 0;
    const fresh = parsed.filter(tx => {
      const hash = buildImportDedupeFingerprint(tx);
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
    setStats(EMPTY_IMPORT_STATS);
    setErrorMessage('');
    setCrossPageStatus('idle');
    setCrossPageMatchCount(0);
    setCrossPageMatchedFingerprints(new Set());
    setPdfPasswordFile(null);
    setPdfPasswordWrong(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => triggerRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (isOpen) {
      const id = setTimeout(() => { (closeButtonRef.current ?? modalRef.current)?.focus(); }, 0);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  const handleModalKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      if (status === 'password_required') {
        setPdfPasswordFile(null);
        setPdfPasswordWrong(false);
        setStatus('idle');
        return;
      }
      closeModal();
      return;
    }
    if (e.key === 'Tab' && modalRef.current) {
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const els   = Array.from(focusable).filter(el => !el.closest('[aria-hidden="true"]'));
      if (els.length === 0) return;
      const first = els[0]!;
      const last  = els[els.length - 1]!;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    }
  };

  const processFile = useCallback(async (file: File, customMapping: { dateIdx: number; descIdx: number; valueIdx: number } | null = null, pdfPassword: string | null = null): Promise<void> => {
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
          setPdfPasswordFile(file);
          setPdfPasswordWrong(pdfPassword !== null);
          setStatus('password_required');
          return;
        }
        throw err;
      }

      if (!parsed || parsed.length === 0) throw new Error('Nenhuma transação válida encontrada no arquivo.');

      const { fresh, duplicates } = deduplicate(parsed);
      const parsedStats = buildImportStats(parsed, file, duplicates, fresh.length);
      if (fresh.length === 0) {
        toast('Todos os registos já existem no Cofre.', { icon: '🛡️' });
        setStats(parsedStats);
        setStatus('success');
        setTimeout(() => closeModal(), 3000);
        return;
      }

      // Busca cross-page em background — não bloqueia o fluxo de importação
      setCrossPageStatus('loading');
      if (uid && parsedStats.periodStart && parsedStats.periodEnd) {
        const _uid   = uid;
        const _start = parsedStats.periodStart;
        const _end   = parsedStats.periodEnd;
        void (async () => {
          try {
            const timeoutProm = new Promise<null>(resolve =>
              setTimeout(() => resolve(null), CROSS_PAGE_CANDIDATE_TIMEOUT_MS)
            );
            const result = await Promise.race([
              findImportCandidateTransactions({ uid: _uid, periodStart: _start, periodEnd: _end }),
              timeoutProm,
            ]);
            if (result === null) { setCrossPageStatus('skipped'); return; }
            const candidateFps = new Set(result.map(buildImportDedupeFingerprint));
            const matched = new Set<string>();
            fresh.forEach(tx => {
              const fp = buildImportDedupeFingerprint(tx);
              if (candidateFps.has(fp)) matched.add(fp);
            });
            setCrossPageMatchedFingerprints(matched);
            setCrossPageMatchCount(matched.size);
            setCrossPageStatus('success');
          } catch {
            setCrossPageStatus('failed');
          }
        })();
      } else {
        setCrossPageStatus('skipped');
      }

      setStatus('ai_processing');
      const forAI = localCategorize(fresh);

      if (forAI.length > 0) {
        const uniqueDescs = [...new Set(forAI.map(tx => tx.description).filter(Boolean))];
        const categoryMap = await batchCategorizeDescriptions(uniqueDescs);
        forAI.forEach(tx => {
          const aiCat = categoryMap[tx.description];
          if (aiCat) { tx.category = aiCat; tx._aiCategorized = true; }
        });
      }

      setReconciliationQueue(fresh);
      setStats(parsedStats);
      setStatus('reconciliation');

    } catch (rawErr) {
      logSanitizedFirebaseError('import_parse', rawErr);
      setErrorMessage(getUserFriendlyErrorMessage(rawErr, 'import_parse'));
      setStatus('error');
    }
  }, [deduplicate, parseFile, parseFileWithMapping, uid]);

  const handleConfirmImport = useCallback(async (selectedTxs: ParsedTransaction[]) => {
    setStatus('importing');
    try {
      const { added, reconciledCount, invalidCount, duplicates, validCount } =
        await processResolvedImportBatch(uid, selectedTxs, onImportTransactions, existingTransactions);

      if (invalidCount > 0) {
        toast.error(`${invalidCount} transação(ões) inválida(s) ignorada(s).`);
      }

      setStats(prev => ({
        ...prev,
        added,
        reconciled: reconciledCount,
        invalid:    invalidCount,
        duplicates: duplicates ?? prev.duplicates,
      }));
      void validCount;
      setStatus('success');
      setTimeout(() => closeModal(), 3000);
    } catch (rawErr) {
      logSanitizedFirebaseError('import_reconcile', rawErr);
      setErrorMessage(getUserFriendlyErrorMessage(rawErr, 'import_reconcile'));
      setStatus('error');
    }
  }, [uid, onImportTransactions, existingTransactions]);

  const handleApplyMapping = useCallback((mapping: { dateIdx: number; descIdx: number; valueIdx: number }) => {
    if (colMapState?.file) void processFile(colMapState.file, mapping);
  }, [colMapState, processFile]);

  const showStepBar = (['parsing','ai_processing','col_mapping','preview','importing'] as ImportStatus[]).includes(status);

  // suppress unused warning for ALLOWED_CATEGORIES (used in PreviewPanel via import)
  void ALLOWED_CATEGORIES;

  return (
    <>
      <button ref={triggerRef} onClick={() => setIsOpen(true)} aria-label="Importar arquivo de extrato" className="btn-quantum-secondary flex items-center gap-2">
        <FileUp className="w-4 h-4" aria-hidden="true" />
        <span className="hidden sm:inline">Importar Ficheiro</span>
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {status === 'reconciliation' && (
            <ReconciliationEngine
              queue={reconciliationQueue}
              existingTransactions={existingTransactions}
              onComplete={(resolvedTxs: Transaction[]) => {
                setPreview(resolvedTxs as ParsedTransaction[]);
                setStatus('preview');
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
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="import-dialog-title"
                tabIndex={-1}
                onKeyDown={handleModalKeyDown}
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
                      <h3 id="import-dialog-title" className="font-black text-quantum-fg text-sm tracking-wide">Ingestão Quântica</h3>
                      <p className="text-[10px] text-quantum-fgMuted">CSV · OFX · PDF · IA Categorization</p>
                    </div>
                  </div>
                  {!(['parsing','ai_processing','importing'] as ImportStatus[]).includes(status) && (
                    <button ref={closeButtonRef} onClick={closeModal} aria-label="Fechar diálogo de importação" className="p-2 text-quantum-fgMuted hover:text-quantum-fg hover:bg-white/5 rounded-xl transition-colors">
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

                    {status === 'password_required' && pdfPasswordFile && (
                      <motion.div key="password_required" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <PasswordPanel
                          file={pdfPasswordFile}
                          wrongPassword={pdfPasswordWrong}
                          onSubmit={pwd => void processFile(pdfPasswordFile, null, pwd)}
                          onCancel={() => {
                            setPdfPasswordFile(null);
                            setPdfPasswordWrong(false);
                            setStatus('idle');
                          }}
                        />
                      </motion.div>
                    )}

                    {status === 'preview' && (
                      <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <PreviewPanel
                          transactions={preview}
                          onConfirm={txs => void handleConfirmImport(txs)}
                          onCancel={() => setStatus('idle')}
                          crossPageStatus={crossPageStatus}
                          crossPageMatchedFingerprints={crossPageMatchedFingerprints}
                          crossPageMatchCount={crossPageMatchCount}
                          categories={userCategories}
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
