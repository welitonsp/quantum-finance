import { useState } from 'react';
import { Download, Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { exportAllUserData, deleteUserAccount } from '../../shared/services/DataPrivacyService';

interface Props {
  uid: string;
}

export default function DataPrivacyPanel({ uid }: Props) {
  const [isExporting,       setIsExporting]       = useState(false);
  const [isDeleting,        setIsDeleting]         = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm]  = useState(false);
  const [confirmText,       setConfirmText]        = useState('');
  const [deleteError,       setDeleteError]        = useState<string | null>(null);

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await exportAllUserData(uid);
      toast.success('Seus dados foram exportados com sucesso!');
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

  return (
    <div className="space-y-6">

      {/* ── Portabilidade de Dados ────────────────────────────────────────── */}
      <section className="bg-quantum-card border border-quantum-border rounded-2xl p-6 space-y-3">
        <h2 className="text-lg font-semibold text-quantum-fg">Meus Dados (LGPD)</h2>
        <p className="text-sm text-quantum-fgMuted">
          Pela Lei Geral de Proteção de Dados (LGPD), você tem direito à portabilidade dos seus dados.
          Clique abaixo para baixar uma cópia completa de todas as suas movimentações, contas, categorias e histórico de auditoria.
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
          Esta ação é irreversível. Todos os seus dados serão removidos e sua conta será encerrada permanentemente.
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
