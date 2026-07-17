import { useState } from 'react';
import {
  ShieldCheck, ScrollText, Clock, BrainCircuit, Tag, ChevronRight,
  CheckCircle2, AlertTriangle, Lock, Bell, BellOff,
} from 'lucide-react';
import { useAuditLogs } from '../../hooks/useAuditLogs';
import AuditTimeline from '../../components/AuditTimeline';
import DataPrivacyPanel from '../settings/DataPrivacyPanel';
import { LoadingPage, Spinner } from '../../shared/components/ui';
import { usePushNotifications } from '../../shared/hooks/usePushNotifications';

interface Props {
  uid: string;
}

const AI_PERMISSIONS = [
  { label: 'Leitura de transações do período selecionado',    allowed: true  },
  { label: 'Escrita direta em transações',                    allowed: false },
  { label: 'Leitura de saldos de contas',                     allowed: true  },
  { label: 'Acesso a dados de terceiros (Open Finance)',       allowed: false },
  { label: 'Execução de transferências ou pagamentos',        allowed: false },
  { label: 'Armazenamento de histórico de conversas',         allowed: false },
  { label: 'Envio de dados financeiros para terceiros',       allowed: false },
];

export default function GovernancePage({ uid }: Props) {
  const { logs, loading: loadingLogs } = useAuditLogs(uid);
  const [showAuditTimeline, setShowAuditTimeline] = useState(false);
  const {
    permission: pushPermission,
    loading:    pushLoading,
    error:      pushError,
    isSupported: pushSupported,
    requestPermission: requestPush,
    revokePermission:  revokePush,
  } = usePushNotifications(uid);

  if (loadingLogs) return <LoadingPage label="Carregando governança..." />;

  const recentCount = logs.length;

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-quantum-accent/10 border border-quantum-accent/25 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-quantum-accent" />
        </div>
        <div>
          <h1 className="text-xl font-black text-quantum-fg">Cofre & Governança</h1>
          <p className="text-xs text-quantum-fgMuted">LGPD, auditoria, histórico append-only e permissões de IA</p>
        </div>
      </div>

      {/* Auditoria */}
      <section aria-labelledby="audit-heading">
        <div className="flex items-center gap-2 mb-4">
          <ScrollText className="w-4 h-4 text-quantum-fgMuted" />
          <h2 id="audit-heading" className="text-sm font-bold text-quantum-fgMuted uppercase tracking-wider">Auditoria</h2>
        </div>
        <div className="bg-quantum-card/40 border border-quantum-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-quantum-fg">Histórico de Auditoria</p>
              <p className="text-xs text-quantum-fgMuted mt-0.5">
                {recentCount} registro{recentCount !== 1 ? 's' : ''} recentes · Histórico append-only, imutável
              </p>
            </div>
            <button
              onClick={() => setShowAuditTimeline(true)}
              className="flex items-center gap-2 px-4 py-2 bg-quantum-bgSecondary border border-quantum-border rounded-xl text-xs font-bold text-quantum-fg hover:border-quantum-accent/40 transition-all"
            >
              <Clock className="w-3.5 h-3.5" />
              Ver Timeline
              <ChevronRight className="w-3.5 h-3.5 text-quantum-fgMuted" />
            </button>
          </div>

          {/* Últimos 3 registros */}
          {logs.slice(0, 3).map(log => (
            <div key={log.id} className="flex items-start gap-3 py-2 border-t border-quantum-border/30">
              <div className="w-1.5 h-1.5 rounded-full bg-quantum-accent/60 mt-1.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-quantum-fg truncate">{log.title}</p>
                <p className="text-[10px] text-quantum-fgMuted mt-0.5">{log.subtitle}</p>
              </div>
              <span className="text-[10px] text-quantum-fgMuted shrink-0 font-mono">
                {new Date(log.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </span>
            </div>
          ))}

          {logs.length === 0 && (
            <p className="text-xs text-quantum-fgMuted">Nenhum registro de auditoria ainda.</p>
          )}
        </div>
      </section>

      {/* Permissões de IA */}
      <section aria-labelledby="ai-perms-heading">
        <div className="flex items-center gap-2 mb-4">
          <BrainCircuit className="w-4 h-4 text-quantum-fgMuted" />
          <h2 id="ai-perms-heading" className="text-sm font-bold text-quantum-fgMuted uppercase tracking-wider">Permissões de IA</h2>
        </div>
        <div className="bg-quantum-card/40 border border-quantum-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-4 h-4 text-amber-400" />
            <p className="text-sm font-black text-quantum-fg">O que o Copilot IA pode acessar</p>
          </div>
          <div className="space-y-2.5">
            {AI_PERMISSIONS.map(({ label, allowed }) => (
              <div key={label} className="flex items-center gap-3">
                {allowed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400/70 shrink-0" />
                )}
                <span className={`text-xs ${allowed ? 'text-quantum-fg' : 'text-quantum-fgMuted line-through'}`}>
                  {label}
                </span>
                <span className={`ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                  allowed
                    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                    : 'text-red-400 border-red-500/25 bg-red-500/8'
                }`}>
                  {allowed ? 'Permitido' : 'Bloqueado'}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-quantum-fgMuted mt-4 leading-relaxed border-t border-quantum-border/30 pt-3">
            Conforme <span className="font-bold">Política Copilot IA — 2026-06-12</span>: toda feature com IA declara dados usados, auditoria, idempotência e requer confirmação humana para ações.
          </p>
        </div>
      </section>

      {/* Categorias */}
      <section aria-labelledby="categories-heading">
        <div className="flex items-center gap-2 mb-4">
          <Tag className="w-4 h-4 text-quantum-fgMuted" />
          <h2 id="categories-heading" className="text-sm font-bold text-quantum-fgMuted uppercase tracking-wider">Categorias</h2>
        </div>
        <div className="bg-quantum-card/40 border border-quantum-border rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-quantum-fg">Gerenciar Categorias</p>
              <p className="text-xs text-quantum-fgMuted mt-0.5">Categorias personalizadas e regras de categorização automática</p>
            </div>
            <span className="text-[10px] text-quantum-fgMuted px-3 py-1.5 border border-quantum-border rounded-xl">
              Via Configurações (⚙️)
            </span>
          </div>
        </div>
      </section>

      {/* Notificações Push */}
      <section aria-labelledby="push-heading">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-quantum-fgMuted" />
          <h2 id="push-heading" className="text-sm font-bold text-quantum-fgMuted uppercase tracking-wider">Notificações Push</h2>
        </div>
        <div className="bg-quantum-card/40 border border-quantum-border rounded-2xl p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-black text-quantum-fg">Notificações no Dispositivo</p>
              <p className="text-xs text-quantum-fgMuted mt-0.5">
                {!pushSupported
                  ? 'Não disponível neste navegador ou ambiente'
                  : pushPermission === 'granted'
                    ? 'Ativas — alertas de orçamento, faturas e metas'
                    : pushPermission === 'denied'
                      ? 'Bloqueadas pelo navegador'
                      : 'Receba alertas de orçamento, faturas e metas'
                }
              </p>
            </div>
            {pushSupported && pushPermission !== 'denied' && (
              <button
                onClick={pushPermission === 'granted' ? revokePush : requestPush}
                disabled={pushLoading}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  pushPermission === 'granted'
                    ? 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20'
                    : 'bg-quantum-bgSecondary border border-quantum-border text-quantum-fg hover:border-quantum-accent/40'
                }`}
              >
                {pushLoading
                  ? <Spinner size="sm" />
                  : pushPermission === 'granted'
                    ? <><BellOff className="w-3.5 h-3.5" />Desativar</>
                    : <><Bell className="w-3.5 h-3.5" />Ativar</>
                }
              </button>
            )}
          </div>
          {pushPermission === 'denied' && (
            <p className="text-xs text-amber-400/80 mt-3 border-t border-quantum-border/30 pt-3">
              Para reativar, altere as permissões de notificação nas configurações do navegador.
            </p>
          )}
          {pushError && (
            <p className="text-xs text-red-400/70 mt-2">{pushError}</p>
          )}
          {!pushSupported && (
            <p className="text-[10px] text-quantum-fgMuted mt-3 border-t border-quantum-border/30 pt-3">
              Requer navegador compatível, HTTPS e chave VAPID configurada (<code className="font-mono">VITE_FCM_VAPID_KEY</code>).
            </p>
          )}
        </div>
      </section>

      {/* LGPD / Privacidade */}
      <section aria-labelledby="lgpd-heading">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-4 h-4 text-quantum-fgMuted" />
          <h2 id="lgpd-heading" className="text-sm font-bold text-quantum-fgMuted uppercase tracking-wider">Privacidade & LGPD</h2>
        </div>
        <DataPrivacyPanel uid={uid} />
      </section>

      {/* AuditTimeline drawer */}
      <AuditTimeline uid={uid} open={showAuditTimeline} onClose={() => setShowAuditTimeline(false)} />
    </div>
  );
}
