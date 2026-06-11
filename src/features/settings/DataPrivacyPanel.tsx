import { useState, useEffect, useCallback } from 'react';
import { Download, Trash2, Loader2, ShieldCheck, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { exportAllUserData, deleteUserAccount } from '../../shared/services/DataPrivacyService';
import { getUserConsents, saveUserConsents, type UserConsents } from '../../shared/services/UserConsentsService';
import {
  getDataProcessingLog,
  logDataProcessingEvent,
  type DataProcessingLogEntry,
} from '../../shared/services/DataProcessingLog';

interface Props {
  uid: string;
}

function formatTs(entry: DataProcessingLogEntry): string {
  if (!entry.createdAt) return '—';
  const d = entry.createdAt.toDate();
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

const EVENT_LABELS: Record<string, string> = {
  consent_granted:   'Consentimento atualizado',
  export_requested:  'Exportação solicitada',
  deletion_requested:'Exclusão de conta solicitada',
  portability:       'Portabilidade de dados',
};

export default function DataPrivacyPanel({ uid }: Props) {
  // ── Export / Delete state ──────────────────────────────────────────────────
  const [isExporting,       setIsExporting]       = useState(false);
  const [isDeleting,        setIsDeleting]         = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm]  = useState(false);
  const [confirmText,       setConfirmText]        = useState('');
  const [deleteError,       setDeleteError]        = useState<string | null>(null);

  // ── Consent state ──────────────────────────────────────────────────────────
  const [consents,        setConsents]        = useState<UserConsents | null>(null);
  const [savingConsents,  setSavingConsents]  = useState(false);
  const [localAnalytics,  setLocalAnalytics]  = useState(false);
  const [localAi,         setLocalAi]         = useState(false);

  // ── Processing log state ───────────────────────────────────────────────────
  const [processingLog,    setProcessingLog]    = useState<DataProcessingLogEntry[]>([]);
  const [loadingLog,       setLoadingLog]       = useState(true);

  // ── Initial data load ──────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const [c, log] = await Promise.all([
      getUserConsents(uid),
      getDataProcessingLog(uid, 10),
    ]);
    setConsents(c);
    setLocalAnalytics(c.analytics);
    setLocalAi(c.ai);
    setProcessingLog(log);
    setLoadingLog(false);
  }, [uid]);

  useEffect(() => { void loadData(); }, [loadData]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSaveConsents = async () => {
    if (savingConsents) return;
    setSavingConsents(true);
    try {
      await saveUserConsents(uid, { analytics: localAnalytics, ai: localAi });
      await logDataProcessingEvent(uid, 'consent_granted', 'analytics + ai preferences updated');
      toast.success('Preferências de consentimento salvas.');
      await loadData();
    } catch {
      toast.error('Não foi possível salvar as preferências. Tente novamente.');
    } finally {
      setSavingConsents(false);
    }
  };

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await exportAllUserData(uid);
      await logDataProcessingEvent(uid, 'export_requested');
      toast.success('Seus dados foram exportados com sucesso!');
      await loadData();
    } catch {
      toast.error('Não foi possível exportar seus dados. Tente novamente.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteRequest = () => {
    setDeleteError(null);
    setConfirmText('');
    setShowDeleteConfirm(true);
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setConfirmText('');
    setDeleteError(null);
  };

  const handleDeleteConfirm = async () => {
    if (confirmText !== 'EXCLUIR' || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await logDataProcessingEvent(uid, 'deletion_requested');
      await deleteUserAccount(uid);
      // On success the Firebase Auth user no longer exists — the app's
      // onAuthStateChanged listener will redirect to the login screen.
    } catch (err) {
      if (err instanceof Error && err.message === 'REQUIRES_RECENT_LOGIN') {
        setDeleteError('Por segurança, faça login novamente antes de excluir sua conta.');
      } else {
        setDeleteError('Não foi possível excluir a conta. Tente novamente.');
      }
      setIsDeleting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Consentimentos ────────────────────────────────────────────────── */}
      <section className="bg-quantum-card border border-quantum-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-quantum-accent" />
          <h2 className="text-lg font-semibold text-quantum-fg">Consentimentos</h2>
        </div>
        <p className="text-sm text-quantum-fgMuted">
          Gerencie como seus dados são utilizados pela plataforma. Você pode revogar a qualquer momento.
        </p>

        {consents === null ? (
          <div className="flex items-center gap-2 text-quantum-fgMuted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Carregando preferências…
          </div>
        ) : (
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={localAnalytics}
                onChange={e => setLocalAnalytics(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-quantum-accent cursor-pointer"
              />
              <div>
                <span className="text-sm font-medium text-quantum-fg">Análise de uso</span>
                <p className="text-xs text-quantum-fgMuted mt-0.5">
                  Permite o uso dos seus dados para melhorias do produto (anonymizados).
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={localAi}
                onChange={e => setLocalAi(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-quantum-accent cursor-pointer"
              />
              <div>
                <span className="text-sm font-medium text-quantum-fg">Processamento por IA</span>
                <p className="text-xs text-quantum-fgMuted mt-0.5">
                  Permite que o assistente Quantum AI analise suas transações para gerar insights personalizados.
                </p>
              </div>
            </label>

            {consents.updatedAt && (
              <p className="text-xs text-quantum-fgMuted">
                Última atualização: {consents.updatedAt.toDate().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              </p>
            )}

            <button
              onClick={() => void handleSaveConsents()}
              disabled={savingConsents}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-quantum-accent/90 hover:bg-quantum-accent disabled:opacity-60 disabled:cursor-not-allowed text-quantum-bg text-sm font-medium transition-colors"
            >
              {savingConsents ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {savingConsents ? 'Salvando…' : 'Salvar preferências'}
            </button>
          </div>
        )}
      </section>

      {/* ── Histórico de Processamento ────────────────────────────────────── */}
      <section className="bg-quantum-card border border-quantum-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-quantum-fgMuted" />
          <h2 className="text-lg font-semibold text-quantum-fg">Histórico de Processamento</h2>
        </div>
        <p className="text-sm text-quantum-fgMuted">
          Registro dos últimos eventos relacionados ao tratamento dos seus dados (LGPD Art. 9°).
        </p>

        {loadingLog ? (
          <div className="flex items-center gap-2 text-quantum-fgMuted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Carregando histórico…
          </div>
        ) : processingLog.length === 0 ? (
          <p className="text-sm text-quantum-fgMuted italic">Nenhum evento registrado ainda.</p>
        ) : (
          <ul className="space-y-2">
            {processingLog.map(entry => (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-3 text-sm py-2 border-b border-quantum-border/40 last:border-0"
              >
                <span className="text-quantum-fg font-medium">
                  {EVENT_LABELS[entry.eventType] ?? entry.eventType}
                </span>
                <span className="text-quantum-fgMuted shrink-0 text-xs mt-0.5">
                  {formatTs(entry)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Portabilidade de Dados ────────────────────────────────────────── */}
      <section className="bg-quantum-card border border-quantum-border rounded-2xl p-6 space-y-3">
        <h2 className="text-lg font-semibold text-quantum-fg">Meus Dados (LGPD)</h2>
        <p className="text-sm text-quantum-fgMuted">
          Pela Lei Geral de Proteção de Dados (LGPD), você tem direito à portabilidade dos seus dados.
          Clique abaixo para baixar uma cópia completa de todas as suas movimentações, contas, categorias,
          orçamentos, histórico de auditoria e demais dados associados à sua conta.
        </p>
        <button
          onClick={() => void handleExport()}
          disabled={isExporting}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {isExporting
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Download className="w-4 h-4" />}
          {isExporting ? 'Exportando…' : 'Baixar meus dados'}
        </button>
      </section>

      {/* ── Zona de Perigo ───────────────────────────────────────────────── */}
      <section className="bg-quantum-card border border-red-800/60 rounded-2xl p-6 space-y-3">
        <h2 className="text-lg font-semibold text-red-400">Zona de Perigo</h2>
        <p className="text-sm text-quantum-fgMuted">
          Esta ação é irreversível. O acesso à sua conta será encerrado e os dados de configuração
          (orçamentos, regras de categoria, cartões e simulações) serão removidos imediatamente.
        </p>
        <p className="text-xs text-quantum-fgMuted/70 leading-relaxed">
          Movimentações financeiras, histórico de auditoria e registros de importação são preservados
          conforme a política de retenção de dados e tornam-se inacessíveis. A remoção completa
          desses registros será concluída via processo administrativo em até 30 dias.
        </p>

        {!showDeleteConfirm && (
          <button
            onClick={handleDeleteRequest}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-red-700 hover:bg-red-900/40 text-red-400 text-sm font-medium transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Excluir minha conta
          </button>
        )}

        {showDeleteConfirm && (
          <div className="space-y-3 pt-1">
            <p className="text-sm text-red-300">
              Para confirmar, digite <span className="font-mono font-bold">EXCLUIR</span> no campo abaixo:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              disabled={isDeleting}
              placeholder="EXCLUIR"
              className="w-full sm:w-64 px-3 py-2 rounded-xl bg-slate-900 border border-quantum-border text-quantum-fg text-sm placeholder-quantum-fgMuted focus:outline-none focus:ring-1 focus:ring-red-600 disabled:opacity-60"
            />
            {deleteError && (
              <p className="text-sm text-red-400">{deleteError}</p>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={() => void handleDeleteConfirm()}
                disabled={confirmText !== 'EXCLUIR' || isDeleting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
              >
                {isDeleting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Trash2 className="w-4 h-4" />}
                {isDeleting ? 'Excluindo…' : 'Confirmar exclusão'}
              </button>
              <button
                onClick={handleDeleteCancel}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl border border-quantum-border hover:bg-slate-800 text-quantum-fgMuted text-sm font-medium transition-colors disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
